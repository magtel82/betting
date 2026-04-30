-- ============================================================
-- Migration — Add email to profiles, fix display_name for Google OAuth
-- ============================================================

-- 1. Add email column to profiles (used as fallback when display_name looks wrong)
alter table profiles add column if not exists email text;

-- 2. Backfill email from auth.users
update profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;

-- 3. Update handle_new_user to:
--    a) store email on the profile
--    b) prefer full_name (Google OAuth provides this, not display_name)
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
    v_account_type := 'manual';
    v_is_active    := true;
  end if;

  -- Prefer full_name (Google OAuth), then display_name, then email prefix
  v_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'),    ''),
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'),         ''),
    split_part(v_email, '@', 1)
  );

  insert into public.profiles (id, display_name, email, account_type, is_active)
  values (new.id, v_display_name, v_email, v_account_type, v_is_active);

  return new;
end;
$$;
