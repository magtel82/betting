-- ============================================================
-- Migration — activate_whitelisted_profile RPC
-- ============================================================
-- Problem: handle_new_user() fires only on the first INSERT into auth.users.
-- If an admin adds a user to invite_whitelist AFTER that user has already tried
-- to sign in (creating a profile with is_active=false), the trigger never runs
-- again, so the profile stays inactive forever.
--
-- Fix: new SECURITY DEFINER function that the inviteUser admin action calls
-- immediately after inserting into invite_whitelist. If a matching auth.users
-- row already exists, it activates the profile and adds a league_members row.
-- Idempotent — safe to call multiple times.
-- ============================================================

create or replace function activate_whitelisted_profile(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_league_id uuid;
  v_activated boolean := false;
  v_joined    boolean := false;
begin
  -- Case-insensitive lookup: auth.users.email may not be stored lowercase
  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    -- User hasn't signed up yet. The trigger will handle activation on first sign-in.
    return jsonb_build_object('user_found', false);
  end if;

  -- Safety: verify email is actually whitelisted before activating
  if not exists(
    select 1 from public.invite_whitelist
    where email = lower(trim(p_email))
  ) then
    return jsonb_build_object('error', 'not_in_whitelist');
  end if;

  -- Activate profile if currently inactive
  update public.profiles
  set is_active = true
  where id = v_user_id and is_active = false;

  v_activated := found;

  -- Add league membership if missing. On conflict = do nothing (preserves
  -- any existing row, whether active or not — deactivated users need admin
  -- to explicitly reactivate via the member toggle, not auto-reinstate).
  select id into v_league_id from public.leagues limit 1;
  if v_league_id is not null then
    insert into public.league_members (league_id, user_id, role, match_wallet, special_wallet)
    values (v_league_id, v_user_id, 'player', 5000, 1000)
    on conflict do nothing;
    v_joined := found;
  end if;

  return jsonb_build_object(
    'user_found', true,
    'activated',  v_activated,
    'joined',     v_joined
  );
end;
$$;

-- Grant execute to authenticated users (admin action calls this via the user's JWT,
-- but the function itself runs as the definer — no privilege escalation for callers)
grant execute on function activate_whitelisted_profile(text) to authenticated;
