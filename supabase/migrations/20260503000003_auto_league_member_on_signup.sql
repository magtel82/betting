-- ============================================================
-- Migration 0019 — Auto-create league_members on Google OAuth signup
-- ============================================================
-- Previously handle_new_user() only created a profiles row.
-- Manual users got league_members via the admin action, but Google
-- OAuth users were silently left without one — meaning no wallet.
--
-- Fix 1: update handle_new_user() to also insert league_members for
--         whitelisted (is_active=true) Google OAuth users.
-- Fix 2: backfill existing profiles that have no league_members row.
-- ============================================================

-- ─── Updated trigger function ─────────────────────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider     text;
  v_email        text;
  v_display_name text;
  v_account_type account_type;
  v_is_active    boolean;
  v_league_id    uuid;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_email    := lower(new.email);

  if v_provider = 'google' then
    v_account_type := 'google';
    if exists(select 1 from public.invite_whitelist where email = v_email) then
      v_is_active := true;
      update public.invite_whitelist
        set used_at = now()
        where email = v_email and used_at is null;
    else
      v_is_active := false;
    end if;
  else
    -- Manual account created by admin with service role key
    v_account_type := 'manual';
    v_is_active    := true;
  end if;

  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(v_email, '@', 1)
  );

  insert into public.profiles (id, display_name, account_type, is_active)
  values (new.id, v_display_name, v_account_type, v_is_active);

  -- Auto-join the (single) league for whitelisted Google OAuth users.
  -- Manual users are added to the league explicitly by the admin action.
  if v_provider = 'google' and v_is_active then
    select id into v_league_id from public.leagues limit 1;
    if v_league_id is not null then
      insert into public.league_members (league_id, user_id, role, match_wallet, special_wallet)
      values (v_league_id, new.id, 'player', 5000, 1000)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- ─── Backfill: existing profiles without a league_members row ──

do $$
declare
  v_league_id uuid;
begin
  select id into v_league_id from public.leagues limit 1;
  if v_league_id is null then
    return;
  end if;

  insert into public.league_members (league_id, user_id, role, match_wallet, special_wallet)
  select
    v_league_id,
    p.id,
    'player',
    5000,
    1000
  from public.profiles p
  where p.is_active = true
    and not exists (
      select 1 from public.league_members lm
      where lm.user_id = p.id
    );
end;
$$;
