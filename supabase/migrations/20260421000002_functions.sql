-- ============================================================
-- Migration 0002 — Functions and triggers
-- ============================================================

-- ─── updated_at trigger ──────────────────────────────────────
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at     before update on profiles     for each row execute function handle_updated_at();
create trigger tournaments_updated_at  before update on tournaments  for each row execute function handle_updated_at();
create trigger leagues_updated_at      before update on leagues      for each row execute function handle_updated_at();
create trigger matches_updated_at      before update on matches      for each row execute function handle_updated_at();

-- ─── handle_new_user ─────────────────────────────────────────
-- Fires after every new auth.users row:
--   - Google OAuth: checked against invite_whitelist; blocked (is_active=false) if missing.
--   - Manual (email/password): always active; created by admin via service role.
-- display_name can be seeded via raw_user_meta_data->>'display_name'.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_provider     text;
  v_email        text;
  v_display_name text;
  v_account_type account_type;
  v_is_active    boolean;
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

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Helper functions (used in RLS) ──────────────────────────

create or replace function is_league_admin(p_league_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.league_members
    where league_id = p_league_id
      and user_id   = auth.uid()
      and role      = 'admin'
      and is_active = true
  );
$$;

create or replace function is_league_member(p_league_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.league_members
    where league_id = p_league_id
      and user_id   = auth.uid()
      and is_active = true
  );
$$;

-- Returns true if caller is admin in any league (used for global admin checks)
create or replace function is_any_admin()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.league_members
    where user_id = auth.uid()
      and role     = 'admin'
      and is_active = true
  );
$$;
