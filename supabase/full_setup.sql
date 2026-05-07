-- ============================================================
-- full_setup.sql
-- Alla migrationer + seed-data i rätt ordning.
-- Kör hela filen en gång i Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- Migration 0001 — Core schema
-- ============================================================

create extension if not exists "uuid-ossp";

create type account_type      as enum ('google', 'manual');
create type league_role       as enum ('admin', 'player');
create type tournament_status as enum ('upcoming', 'group_stage', 'knockout', 'finished');
create type match_stage       as enum ('group', 'r32', 'r16', 'qf', 'sf', '3rd_place', 'final');
create type match_status      as enum ('scheduled', 'live', 'finished', 'void');

create table profiles (
  id           uuid         primary key references auth.users(id) on delete cascade,
  display_name text         not null,
  account_type account_type not null default 'google',
  is_active    boolean      not null default true,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now()
);

create table invite_whitelist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  invited_by  uuid        references profiles(id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table tournaments (
  id                    uuid              primary key default gen_random_uuid(),
  name                  text              not null,
  status                tournament_status not null default 'upcoming',
  special_bets_deadline timestamptz,
  created_at            timestamptz       not null default now(),
  updated_at            timestamptz       not null default now()
);

create table teams (
  id            uuid        primary key default gen_random_uuid(),
  tournament_id uuid        not null references tournaments(id) on delete cascade,
  name          text        not null,
  short_name    char(3)     not null,
  flag_emoji    text,
  group_letter  char(1),
  created_at    timestamptz not null default now()
);

create index on teams(tournament_id);

create table matches (
  id            uuid         primary key default gen_random_uuid(),
  tournament_id uuid         not null references tournaments(id) on delete cascade,
  match_number  int          not null,
  stage         match_stage  not null default 'group',
  group_letter  char(1),
  home_team_id  uuid         references teams(id) on delete set null,
  away_team_id  uuid         references teams(id) on delete set null,
  scheduled_at  timestamptz  not null,
  status        match_status not null default 'scheduled',
  home_score    int,
  away_score    int,
  home_score_ht int,
  away_score_ht int,
  external_id   text         unique,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);

create index on matches(tournament_id);
create index on matches(scheduled_at);
create index on matches(stage);

create table leagues (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  tournament_id uuid        not null references tournaments(id) on delete restrict,
  is_open       boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table league_members (
  id             uuid        primary key default gen_random_uuid(),
  league_id      uuid        not null references leagues(id) on delete cascade,
  user_id        uuid        not null references profiles(id) on delete cascade,
  role           league_role not null default 'player',
  match_wallet   int         not null default 5000,
  special_wallet int         not null default 1000,
  is_active      boolean     not null default true,
  joined_at      timestamptz not null default now(),
  unique(league_id, user_id),
  constraint match_wallet_non_negative   check (match_wallet >= 0),
  constraint special_wallet_non_negative check (special_wallet >= 0)
);

create index on league_members(league_id);
create index on league_members(user_id);

create table audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid        references profiles(id) on delete set null,
  action      text        not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index on audit_log(actor_id);
create index on audit_log(created_at desc);
create index on audit_log(entity_type, entity_id);


-- ============================================================
-- Migration 0002 — Functions and triggers
-- ============================================================

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

create or replace function is_any_admin()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.league_members
    where user_id = auth.uid()
      and role     = 'admin'
      and is_active = true
  );
$$;


-- ============================================================
-- Migration 0003 — Row Level Security
-- ============================================================

alter table profiles         enable row level security;
alter table invite_whitelist enable row level security;
alter table tournaments      enable row level security;
alter table teams            enable row level security;
alter table matches          enable row level security;
alter table leagues          enable row level security;
alter table league_members   enable row level security;
alter table audit_log        enable row level security;

create policy "profiles: authenticated can read all"
  on profiles for select to authenticated using (true);

create policy "profiles: user can update own row"
  on profiles for update to authenticated
  using     (auth.uid() = id)
  with check (auth.uid() = id);

create policy "whitelist: admin full access"
  on invite_whitelist for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "tournaments: authenticated can read"
  on tournaments for select to authenticated using (true);

create policy "tournaments: admin can write"
  on tournaments for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "teams: authenticated can read"
  on teams for select to authenticated using (true);

create policy "teams: admin can write"
  on teams for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "matches: authenticated can read"
  on matches for select to authenticated using (true);

create policy "matches: admin can write"
  on matches for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "leagues: members can read own league"
  on leagues for select to authenticated
  using (is_league_member(id));

create policy "leagues: admin can update"
  on leagues for update to authenticated
  using     (is_league_admin(id))
  with check (is_league_admin(id));

create policy "league_members: members can read their league"
  on league_members for select to authenticated
  using (is_league_member(league_id));

create policy "league_members: admin can manage"
  on league_members for all to authenticated
  using     (is_league_admin(league_id))
  with check (is_league_admin(league_id));

create policy "audit_log: admin can read"
  on audit_log for select to authenticated
  using (is_any_admin());

create policy "audit_log: authenticated can insert own actions"
  on audit_log for insert to authenticated
  with check (actor_id = auth.uid());


-- ============================================================
-- Migration 0004 — match_odds
-- ============================================================

create table match_odds (
  id         uuid          primary key default gen_random_uuid(),
  match_id   uuid          not null references matches(id) on delete cascade,
  home_odds  numeric(6,2)  not null check (home_odds > 1.0),
  draw_odds  numeric(6,2)  not null check (draw_odds > 1.0),
  away_odds  numeric(6,2)  not null check (away_odds > 1.0),
  source     text          not null default 'admin' check (source in ('admin', 'api')),
  set_by     uuid          references profiles(id) on delete set null,
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now(),
  unique(match_id)
);

create index on match_odds(match_id);

create trigger match_odds_updated_at
  before update on match_odds
  for each row execute function handle_updated_at();

alter table match_odds enable row level security;

create policy "match_odds: authenticated can read"
  on match_odds for select to authenticated using (true);

create policy "match_odds: admin can write"
  on match_odds for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());


-- ============================================================
-- Migration 0005 — Matchbetting schema
-- ============================================================

create type slip_status as enum ('open', 'locked', 'won', 'lost', 'void', 'cancelled');
create type bet_status  as enum ('open', 'won', 'lost', 'void', 'cancelled');

create type wallet_tx_type as enum (
  'bet_stake',
  'bet_payout',
  'bet_refund',
  'inactivity_fee',
  'group_bonus',
  'admin_adjust'
);

create table bet_slips (
  id               uuid          primary key default gen_random_uuid(),
  league_member_id uuid          not null references league_members(id) on delete restrict,
  stake            int           not null check (stake >= 10),
  combined_odds    numeric(10,4) not null check (combined_odds > 1.0),
  potential_payout int           not null check (potential_payout > 0),
  status           slip_status   not null default 'open',
  placed_at        timestamptz   not null default now(),
  locked_at        timestamptz,
  settled_at       timestamptz,
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now()
);

create index on bet_slips(league_member_id);
create index on bet_slips(status);
create index on bet_slips(placed_at desc);

create trigger bet_slips_updated_at
  before update on bet_slips
  for each row execute function handle_updated_at();

create table bet_slip_selections (
  id            uuid         primary key default gen_random_uuid(),
  slip_id       uuid         not null references bet_slips(id) on delete cascade,
  match_id      uuid         not null references matches(id) on delete restrict,
  outcome       text         not null check (outcome in ('home', 'draw', 'away')),
  odds_snapshot numeric(6,2) not null check (odds_snapshot > 1.0),
  status        bet_status   not null default 'open',
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  unique(slip_id, match_id)
);

create index on bet_slip_selections(slip_id);
create index on bet_slip_selections(match_id);

create trigger bet_slip_selections_updated_at
  before update on bet_slip_selections
  for each row execute function handle_updated_at();

create table match_wallet_transactions (
  id               uuid           primary key default gen_random_uuid(),
  league_member_id uuid           not null references league_members(id) on delete restrict,
  amount           int            not null,
  type             wallet_tx_type not null,
  slip_id          uuid           references bet_slips(id) on delete set null,
  created_at       timestamptz    not null default now()
);

create index on match_wallet_transactions(league_member_id);
create index on match_wallet_transactions(slip_id);
create index on match_wallet_transactions(created_at desc);

alter table bet_slips                 enable row level security;
alter table bet_slip_selections       enable row level security;
alter table match_wallet_transactions enable row level security;

create policy "bet_slips: league members can read"
  on bet_slips for select to authenticated
  using (
    is_league_member(
      (select league_id from league_members where id = bet_slips.league_member_id)
    )
  );

create policy "bet_slips: admin can read all"
  on bet_slips for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "bet_slip_selections: league members can read"
  on bet_slip_selections for select to authenticated
  using (
    is_league_member(
      (select league_id from league_members lm
       join bet_slips bs on bs.league_member_id = lm.id
       where bs.id = bet_slip_selections.slip_id)
    )
  );

create policy "bet_slip_selections: admin can read all"
  on bet_slip_selections for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "wallet_tx: member sees own"
  on match_wallet_transactions for select to authenticated
  using (
    league_member_id in (
      select id from league_members
      where user_id = auth.uid() and is_active = true
    )
  );

create policy "wallet_tx: admin sees all"
  on match_wallet_transactions for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create or replace function place_bet_slip(
  p_league_member_id uuid,
  p_stake            int,
  p_selections       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member         record;
  v_max_stake      int;
  v_slip_id        uuid;
  v_combined_odds  numeric(10,4) := 1.0;
  v_potential_pay  int;
  v_sel            jsonb;
  v_match          record;
  v_odds_row       record;
  v_submitted_odds numeric(6,2);
  v_current_odds   numeric(6,2);
  v_outcome        text;
  v_match_id       uuid;
  v_sel_count      int;
begin
  select * into v_member
  from league_members
  where id = p_league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if not exists(
    select 1 from leagues where id = v_member.league_id and is_open = true
  ) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  v_max_stake := floor(v_member.match_wallet * 0.3);
  if p_stake < 10 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;
  if p_stake > v_max_stake then
    return jsonb_build_object('error', 'stake_exceeds_limit',
                              'max_stake', v_max_stake,
                              'balance',   v_member.match_wallet);
  end if;
  if p_stake > v_member.match_wallet then
    return jsonb_build_object('error', 'insufficient_balance',
                              'balance', v_member.match_wallet);
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    if v_outcome not in ('home', 'draw', 'away') then
      return jsonb_build_object('error', 'invalid_outcome', 'match_id', v_match_id);
    end if;

    select * into v_match from matches where id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'match_not_found', 'match_id', v_match_id);
    end if;

    if v_match.status != 'scheduled' or v_match.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_not_bettable', 'match_id', v_match_id);
    end if;

    select * into v_odds_row from match_odds where match_id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'no_odds', 'match_id', v_match_id);
    end if;

    case v_outcome
      when 'home' then v_current_odds := v_odds_row.home_odds;
      when 'draw' then v_current_odds := v_odds_row.draw_odds;
      when 'away' then v_current_odds := v_odds_row.away_odds;
    end case;

    v_submitted_odds := (v_sel->>'odds_snapshot')::numeric(6,2);
    if v_submitted_odds != v_current_odds then
      return jsonb_build_object(
        'error',     'odds_changed',
        'match_id',  v_match_id,
        'submitted', v_submitted_odds,
        'current',   v_current_odds
      );
    end if;

    v_combined_odds := v_combined_odds * v_current_odds;
  end loop;

  v_potential_pay := floor(p_stake * v_combined_odds);

  update league_members
  set match_wallet = match_wallet - p_stake
  where id = p_league_member_id;

  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (p_league_member_id, p_stake, v_combined_odds, v_potential_pay, 'open')
  returning id into v_slip_id;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    select * into v_odds_row from match_odds where match_id = v_match_id;

    case v_outcome
      when 'home' then v_current_odds := v_odds_row.home_odds;
      when 'draw' then v_current_odds := v_odds_row.draw_odds;
      when 'away' then v_current_odds := v_odds_row.away_odds;
    end case;

    insert into bet_slip_selections (slip_id, match_id, outcome, odds_snapshot)
    values (v_slip_id, v_match_id, v_outcome, v_current_odds);
  end loop;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (p_league_member_id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',               true,
    'slip_id',          v_slip_id,
    'combined_odds',    v_combined_odds,
    'potential_payout', v_potential_pay
  );
end;
$$;


-- ============================================================
-- Migration 0006 — cancel_bet_slip + amend_bet_slip
-- ============================================================

create or replace function cancel_bet_slip(p_slip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slip   record;
  v_member record;
  v_sel    record;
begin
  select * into v_slip from bet_slips where id = p_slip_id for update;
  if not found then
    return jsonb_build_object('error', 'slip_not_found');
  end if;

  select * into v_member
  from league_members
  where id = v_slip.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_slip.status != 'open' then
    return jsonb_build_object('error', 'slip_not_open', 'status', v_slip.status::text);
  end if;

  for v_sel in
    select bss.match_id, m.scheduled_at
    from bet_slip_selections bss
    join matches m on m.id = bss.match_id
    where bss.slip_id = p_slip_id
  loop
    if v_sel.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_already_started', 'match_id', v_sel.match_id);
    end if;
  end loop;

  update bet_slips set status = 'cancelled' where id = p_slip_id;

  update league_members
  set match_wallet = match_wallet + v_slip.stake
  where id = v_member.id;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, v_slip.stake, 'bet_refund', p_slip_id);

  return jsonb_build_object('ok', true, 'refunded', v_slip.stake);
end;
$$;


create or replace function amend_bet_slip(
  p_old_slip_id uuid,
  p_stake       int,
  p_selections  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_slip      record;
  v_member        record;
  v_effective_bal int;
  v_max_stake     int;
  v_combined      numeric(10,4) := 1.0;
  v_slip_id       uuid;
  v_potential     int;
  v_sel           jsonb;
  v_match         record;
  v_odds_row      record;
  v_submitted     numeric(6,2);
  v_current       numeric(6,2);
  v_outcome       text;
  v_match_id      uuid;
  v_sel_count     int;
  v_old_sel       record;
begin
  select * into v_old_slip from bet_slips where id = p_old_slip_id for update;
  if not found then
    return jsonb_build_object('error', 'slip_not_found');
  end if;

  select * into v_member
  from league_members
  where id = v_old_slip.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_old_slip.status != 'open' then
    return jsonb_build_object('error', 'slip_not_open', 'status', v_old_slip.status::text);
  end if;

  for v_old_sel in
    select bss.match_id, m.scheduled_at
    from bet_slip_selections bss
    join matches m on m.id = bss.match_id
    where bss.slip_id = p_old_slip_id
  loop
    if v_old_sel.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_already_started', 'match_id', v_old_sel.match_id);
    end if;
  end loop;

  if not exists(select 1 from leagues where id = v_member.league_id and is_open = true) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  v_effective_bal := v_member.match_wallet + v_old_slip.stake;
  v_max_stake     := floor(v_effective_bal * 0.3);

  if p_stake < 10 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;
  if p_stake > v_max_stake then
    return jsonb_build_object('error', 'stake_exceeds_limit', 'max_stake', v_max_stake);
  end if;
  if p_stake > v_effective_bal then
    return jsonb_build_object('error', 'insufficient_balance');
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    if v_outcome not in ('home', 'draw', 'away') then
      return jsonb_build_object('error', 'invalid_outcome', 'match_id', v_match_id);
    end if;

    select * into v_match from matches where id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'match_not_found', 'match_id', v_match_id);
    end if;

    if v_match.status != 'scheduled' or v_match.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_not_bettable', 'match_id', v_match_id);
    end if;

    select * into v_odds_row from match_odds where match_id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'no_odds', 'match_id', v_match_id);
    end if;

    case v_outcome
      when 'home' then v_current := v_odds_row.home_odds;
      when 'draw' then v_current := v_odds_row.draw_odds;
      when 'away' then v_current := v_odds_row.away_odds;
    end case;

    v_submitted := (v_sel->>'odds_snapshot')::numeric(6,2);
    if v_submitted != v_current then
      return jsonb_build_object(
        'error',     'odds_changed',
        'match_id',  v_match_id,
        'submitted', v_submitted,
        'current',   v_current
      );
    end if;

    v_combined := v_combined * v_current;
  end loop;

  v_potential := floor(p_stake * v_combined);

  update bet_slips set status = 'cancelled' where id = p_old_slip_id;

  update league_members
  set match_wallet = match_wallet + v_old_slip.stake - p_stake
  where id = v_member.id;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, v_old_slip.stake, 'bet_refund', p_old_slip_id);

  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (v_member.id, p_stake, v_combined, v_potential, 'open')
  returning id into v_slip_id;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    select * into v_odds_row from match_odds where match_id = v_match_id;

    case v_outcome
      when 'home' then v_current := v_odds_row.home_odds;
      when 'draw' then v_current := v_odds_row.draw_odds;
      when 'away' then v_current := v_odds_row.away_odds;
    end case;

    insert into bet_slip_selections (slip_id, match_id, outcome, odds_snapshot)
    values (v_slip_id, v_match_id, v_outcome, v_current);
  end loop;

  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',               true,
    'slip_id',          v_slip_id,
    'combined_odds',    v_combined,
    'potential_payout', v_potential,
    'refunded',         v_old_slip.stake
  );
end;
$$;


-- ============================================================
-- Migration 0007 — Settlement engine
-- ============================================================

alter table bet_slips
  add column final_odds numeric(10,4);

create or replace function settle_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match              record;
  v_outcome            text;
  v_sel                record;
  v_new_sel_status     bet_status;
  v_slip_id            uuid;
  v_slip               record;
  v_member             record;
  v_all_settled        boolean;
  v_all_void           boolean;
  v_any_lost           boolean;
  v_final_odds         numeric(10,4);
  v_payout             int;
  v_selections_settled int := 0;
  v_slips_won          int := 0;
  v_slips_lost         int := 0;
  v_slips_void_count   int := 0;
  v_total_payout       int := 0;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    return jsonb_build_object('error', 'match_not_found');
  end if;

  if v_match.status not in ('finished', 'void') then
    return jsonb_build_object('error', 'match_not_settleable',
                              'status', v_match.status::text);
  end if;

  if v_match.status = 'finished' and
     (v_match.home_score is null or v_match.away_score is null) then
    return jsonb_build_object('error', 'scores_missing');
  end if;

  if v_match.status = 'void' then
    v_outcome := null;
  elsif v_match.home_score > v_match.away_score then
    v_outcome := 'home';
  elsif v_match.away_score > v_match.home_score then
    v_outcome := 'away';
  else
    v_outcome := 'draw';
  end if;

  for v_sel in
    select bss.id, bss.outcome
    from bet_slip_selections bss
    join bet_slips bs on bs.id = bss.slip_id
    where bss.match_id = p_match_id
      and bss.status   = 'open'
      and bs.status    in ('open', 'locked')
    for update of bss
  loop
    if v_outcome is null then
      v_new_sel_status := 'void';
    elsif v_sel.outcome = v_outcome then
      v_new_sel_status := 'won';
    else
      v_new_sel_status := 'lost';
    end if;

    update bet_slip_selections
    set status = v_new_sel_status, updated_at = now()
    where id = v_sel.id;

    v_selections_settled := v_selections_settled + 1;
  end loop;

  for v_slip_id in
    select distinct bss.slip_id
    from bet_slip_selections bss
    join bet_slips bs on bs.id = bss.slip_id
    where bss.match_id = p_match_id
      and bs.status     in ('open', 'locked')
  loop
    select
      bool_and(bss.status != 'open') as all_settled,
      bool_and(bss.status  = 'void') as all_void,
      bool_or (bss.status  = 'lost') as any_lost
    into v_all_settled, v_all_void, v_any_lost
    from bet_slip_selections bss
    where bss.slip_id = v_slip_id;

    if not v_all_settled then
      continue;
    end if;

    select * into v_slip from bet_slips where id = v_slip_id for update;
    if v_slip.status not in ('open', 'locked') then
      continue;
    end if;

    select * into v_member from league_members
    where id = v_slip.league_member_id for update;

    if v_all_void then
      update bet_slips
      set status     = 'void',
          settled_at = now(),
          final_odds = null,
          updated_at = now()
      where id = v_slip_id;

      update league_members
      set match_wallet = match_wallet + v_slip.stake
      where id = v_member.id;

      insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
      values (v_member.id, v_slip.stake, 'bet_refund', v_slip_id);

      v_slips_void_count := v_slips_void_count + 1;

    elsif v_any_lost then
      update bet_slips
      set status     = 'lost',
          settled_at = now(),
          final_odds = null,
          updated_at = now()
      where id = v_slip_id;

      v_slips_lost := v_slips_lost + 1;

    else
      select exp(sum(ln(bss.odds_snapshot::float8)))::numeric(10,4)
      into v_final_odds
      from bet_slip_selections bss
      where bss.slip_id = v_slip_id and bss.status = 'won';

      v_payout := floor(v_slip.stake * v_final_odds);

      update bet_slips
      set status     = 'won',
          settled_at = now(),
          final_odds = v_final_odds,
          updated_at = now()
      where id = v_slip_id;

      update league_members
      set match_wallet = match_wallet + v_payout
      where id = v_member.id;

      insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
      values (v_member.id, v_payout, 'bet_payout', v_slip_id);

      v_slips_won    := v_slips_won + 1;
      v_total_payout := v_total_payout + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',                 true,
    'match_id',           p_match_id,
    'match_status',       v_match.status::text,
    'outcome',            v_outcome,
    'selections_settled', v_selections_settled,
    'slips_won',          v_slips_won,
    'slips_lost',         v_slips_lost,
    'slips_void',         v_slips_void_count,
    'total_payout',       v_total_payout
  );
end;
$$;

revoke execute on function settle_match(uuid) from public;
grant  execute on function settle_match(uuid) to service_role;


-- ============================================================
-- Migration 0008 — Slip-låsning, inaktivitetsavgift, gruppbonus
-- ============================================================

alter table match_wallet_transactions
  add column fee_date date;

create index on match_wallet_transactions(league_member_id, type, fee_date);

create or replace function lock_started_slips()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked int;
begin
  with slips_to_lock as (
    select distinct bs.id
    from bet_slips bs
    join bet_slip_selections bss on bss.slip_id = bs.id
    join matches m              on m.id          = bss.match_id
    where bs.status   = 'open'
      and m.scheduled_at <= now()
  )
  update bet_slips
  set status     = 'locked',
      locked_at  = now(),
      updated_at = now()
  where id in (select id from slips_to_lock)
    and status = 'open';

  get diagnostics v_locked = row_count;

  return jsonb_build_object('ok', true, 'locked', v_locked);
end;
$$;

create or replace function apply_inactivity_fee(
  p_league_id uuid,
  p_fee_date  date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_matchday  boolean;
  v_member       record;
  v_already_done boolean;
  v_is_active    boolean;
  v_charge       int;
  v_charged      int := 0;
  v_active       int := 0;
  v_skip_zero    int := 0;
  v_skip_idem    int := 0;
begin
  select exists(
    select 1
    from matches m
    join leagues l on l.tournament_id = m.tournament_id
    where l.id     = p_league_id
      and m.status != 'void'
      and (m.scheduled_at at time zone 'Europe/Stockholm')::date = p_fee_date
  ) into v_is_matchday;

  if not v_is_matchday then
    return jsonb_build_object(
      'ok', true, 'skipped', 'not_a_matchday', 'fee_date', p_fee_date, 'charged', 0
    );
  end if;

  for v_member in
    select id, match_wallet
    from league_members
    where league_id = p_league_id and is_active = true
    for update
  loop
    select exists(
      select 1 from match_wallet_transactions
      where league_member_id = v_member.id
        and type     = 'inactivity_fee'
        and fee_date = p_fee_date
    ) into v_already_done;

    if v_already_done then
      v_skip_idem := v_skip_idem + 1;
      continue;
    end if;

    if v_member.match_wallet <= 0 then
      v_skip_zero := v_skip_zero + 1;
      continue;
    end if;

    select exists(
      select 1 from bet_slips
      where league_member_id = v_member.id
        and (placed_at at time zone 'Europe/Stockholm')::date = p_fee_date
    ) into v_is_active;

    if not v_is_active then
      select exists(
        select 1
        from bet_slips bs
        join bet_slip_selections bss on bss.slip_id = bs.id
        join matches m              on m.id          = bss.match_id
        where bs.league_member_id = v_member.id
          and bs.status in ('open', 'locked')
          and (m.scheduled_at at time zone 'Europe/Stockholm')::date = p_fee_date
      ) into v_is_active;
    end if;

    if v_is_active then
      v_active := v_active + 1;
      continue;
    end if;

    v_charge := least(50, v_member.match_wallet);

    update league_members
    set match_wallet = match_wallet - v_charge
    where id = v_member.id;

    insert into match_wallet_transactions (league_member_id, amount, type, fee_date)
    values (v_member.id, -v_charge, 'inactivity_fee', p_fee_date);

    v_charged := v_charged + 1;
  end loop;

  return jsonb_build_object(
    'ok',        true,
    'fee_date',  p_fee_date,
    'charged',   v_charged,
    'active',    v_active,
    'skip_zero', v_skip_zero,
    'skip_idem', v_skip_idem
  );
end;
$$;

create or replace function apply_group_bonus(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league    record;
  v_member    record;
  v_row       record;
  v_bonus     int;
  v_result    jsonb := '[]';
begin
  select * into v_league from leagues where id = p_league_id;
  if not found then
    return jsonb_build_object('error', 'league_not_found');
  end if;

  if exists(
    select 1 from matches
    where tournament_id = v_league.tournament_id
      and stage  = 'group'
      and status not in ('finished', 'void')
  ) then
    return jsonb_build_object('error', 'group_stage_not_complete');
  end if;

  if exists(
    select 1
    from match_wallet_transactions mwt
    join league_members lm on lm.id = mwt.league_member_id
    where lm.league_id = p_league_id
      and mwt.type     = 'group_bonus'
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'already_applied');
  end if;

  for v_row in
    with member_stats as (
      select
        lm.id                                                         as member_id,
        lm.match_wallet + lm.special_wallet                          as total_coins,
        coalesce(
          max(bs.final_odds) filter (where bs.status = 'won'),
          0::numeric(10,4)
        )                                                             as best_win_odds,
        count(bs.id) filter (where bs.status = 'won')::int           as won_slips
      from league_members lm
      left join bet_slips bs on bs.league_member_id = lm.id
      where lm.league_id = p_league_id
        and lm.is_active  = true
      group by lm.id, lm.match_wallet, lm.special_wallet
    )
    select
      member_id,
      total_coins,
      best_win_odds,
      won_slips,
      rank() over (
        order by total_coins desc, best_win_odds desc, won_slips desc
      )::int as placement
    from member_stats
    order by placement
  loop
    if    v_row.placement = 1 then v_bonus := 500;
    elsif v_row.placement = 2 then v_bonus := 300;
    elsif v_row.placement = 3 then v_bonus := 200;
    else                           v_bonus := 100;
    end if;

    select * into v_member from league_members where id = v_row.member_id for update;

    update league_members
    set match_wallet = match_wallet + v_bonus
    where id = v_row.member_id;

    insert into match_wallet_transactions (league_member_id, amount, type)
    values (v_row.member_id, v_bonus, 'group_bonus');

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'member_id',   v_row.member_id,
        'placement',   v_row.placement,
        'bonus',       v_bonus,
        'total_coins', v_row.total_coins
      )
    );
  end loop;

  return jsonb_build_object('ok', true, 'bonuses', v_result);
end;
$$;

revoke execute on function lock_started_slips()             from public;
revoke execute on function apply_inactivity_fee(uuid, date) from public;
revoke execute on function apply_group_bonus(uuid)          from public;

grant  execute on function lock_started_slips()             to service_role;
grant  execute on function apply_inactivity_fee(uuid, date) to service_role;
grant  execute on function apply_group_bonus(uuid)          to service_role;


-- ============================================================
-- Migration 0009 — Specialbets schema
-- ============================================================

create type special_market_type as enum (
  'vm_vinnare',
  'skyttekung',
  'sverige_mal'
);

create type special_bet_status as enum (
  'active',
  'superseded',
  'cancelled'
);

create type special_wallet_tx_type as enum (
  'special_stake',
  'special_payout',
  'special_refund',
  'admin_adjust'
);

create table special_markets (
  id                  uuid                 primary key default gen_random_uuid(),
  tournament_id       uuid                 not null references tournaments(id) on delete cascade,
  type                special_market_type  not null,
  label               text                 not null,
  odds                numeric(8,2)         check (odds is null or odds > 1.0),
  fixed_payout_factor numeric(8,2)         check (fixed_payout_factor is null or fixed_payout_factor > 1.0),
  set_by              uuid                 references profiles(id) on delete set null,
  created_at          timestamptz          not null default now(),
  updated_at          timestamptz          not null default now(),
  unique(tournament_id, type)
);

create index on special_markets(tournament_id);

create trigger special_markets_updated_at
  before update on special_markets
  for each row execute function handle_updated_at();

create table special_bets (
  id               uuid                primary key default gen_random_uuid(),
  league_member_id uuid                not null references league_members(id) on delete restrict,
  market_id        uuid                not null references special_markets(id) on delete restrict,
  version          int                 not null default 1 check (version >= 1),
  selection_text   text                not null,
  stake            int                 not null check (stake >= 100),
  odds_snapshot    numeric(8,2)        not null check (odds_snapshot > 1.0),
  potential_payout int                 not null check (potential_payout > 0),
  status           special_bet_status  not null default 'active',
  placed_at        timestamptz         not null default now(),
  settled_at       timestamptz,
  created_at       timestamptz         not null default now(),
  updated_at       timestamptz         not null default now()
);

create index on special_bets(league_member_id);
create index on special_bets(market_id);
create index on special_bets(league_member_id, market_id);

create unique index special_bets_one_active
  on special_bets(league_member_id, market_id)
  where status = 'active';

create trigger special_bets_updated_at
  before update on special_bets
  for each row execute function handle_updated_at();

create table special_wallet_transactions (
  id               uuid                    primary key default gen_random_uuid(),
  league_member_id uuid                    not null references league_members(id) on delete restrict,
  amount           int                     not null,
  type             special_wallet_tx_type  not null,
  special_bet_id   uuid                    references special_bets(id) on delete set null,
  created_at       timestamptz             not null default now()
);

create index on special_wallet_transactions(league_member_id);
create index on special_wallet_transactions(special_bet_id);

alter table special_markets             enable row level security;
alter table special_bets                enable row level security;
alter table special_wallet_transactions enable row level security;

create policy "special_markets: authenticated can read"
  on special_markets for select to authenticated using (true);

create policy "special_markets: admin can write"
  on special_markets for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "special_bets: member sees own"
  on special_bets for select to authenticated
  using (
    league_member_id in (
      select id from league_members where user_id = auth.uid() and is_active = true
    )
  );

create policy "special_bets: admin sees all"
  on special_bets for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

create policy "special_wallet_tx: member sees own"
  on special_wallet_transactions for select to authenticated
  using (
    league_member_id in (
      select id from league_members where user_id = auth.uid() and is_active = true
    )
  );

create policy "special_wallet_tx: admin sees all"
  on special_wallet_transactions for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());


-- ============================================================
-- Migration 0010 — Specialbet RPCs
-- ============================================================

create or replace function place_special_bet(
  p_member_id      uuid,
  p_market_id      uuid,
  p_selection_text text,
  p_stake          int,
  p_odds_snapshot  numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member         record;
  v_league         record;
  v_tournament     record;
  v_market         record;
  v_existing_bet   record;
  v_has_existing   boolean  := false;
  v_effective_odds numeric;
  v_effective_bal  int;
  v_new_version    int;
  v_new_bet_id     uuid;
  v_payout         int;
begin
  select * into v_member
  from league_members
  where id = p_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select * into v_league from leagues where id = v_member.league_id;
  if not found or not v_league.is_open then
    return jsonb_build_object('error', 'league_closed');
  end if;

  select * into v_tournament from tournaments where id = v_league.tournament_id;
  if v_tournament.special_bets_deadline is not null
     and now() >= v_tournament.special_bets_deadline then
    return jsonb_build_object('error', 'deadline_passed');
  end if;

  if p_stake < 100 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;

  select * into v_market from special_markets where id = p_market_id;
  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  if v_market.type in ('vm_vinnare', 'skyttekung') then
    if v_market.odds is null then
      return jsonb_build_object('error', 'no_odds');
    end if;
    if v_market.odds != p_odds_snapshot then
      return jsonb_build_object(
        'error',        'odds_changed',
        'current_odds', v_market.odds
      );
    end if;
    v_effective_odds := v_market.odds;
  else
    v_effective_odds := v_market.fixed_payout_factor;
  end if;

  select * into v_existing_bet
  from special_bets
  where league_member_id = p_member_id
    and market_id         = p_market_id
    and status            = 'active'
  for update;

  if found then
    v_has_existing  := true;
    v_effective_bal := v_member.special_wallet + v_existing_bet.stake;
    v_new_version   := v_existing_bet.version + 1;
  else
    v_has_existing  := false;
    v_effective_bal := v_member.special_wallet;
    v_new_version   := 1;
  end if;

  if v_effective_bal < p_stake then
    return jsonb_build_object(
      'error',   'insufficient_balance',
      'balance', v_effective_bal
    );
  end if;

  if v_has_existing then
    update special_bets set status = 'superseded' where id = v_existing_bet.id;
  end if;

  v_payout := floor(p_stake::numeric * v_effective_odds);

  insert into special_bets (
    league_member_id, market_id, version,
    selection_text, stake, odds_snapshot, potential_payout, status
  )
  values (
    p_member_id, p_market_id, v_new_version,
    p_selection_text, p_stake, v_effective_odds, v_payout, 'active'
  )
  returning id into v_new_bet_id;

  update league_members
  set special_wallet = v_effective_bal - p_stake
  where id = p_member_id;

  if v_has_existing then
    insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
    values (p_member_id, v_existing_bet.stake, 'special_refund', v_existing_bet.id);
  end if;

  insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
  values (p_member_id, -p_stake, 'special_stake', v_new_bet_id);

  return jsonb_build_object(
    'ok',               true,
    'special_bet_id',   v_new_bet_id,
    'version',          v_new_version,
    'odds_snapshot',    v_effective_odds,
    'potential_payout', v_payout
  );
end;
$$;

create or replace function cancel_special_bet(p_bet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet        record;
  v_member     record;
  v_league     record;
  v_tournament record;
begin
  select * into v_bet
  from special_bets
  where id = p_bet_id
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select * into v_member
  from league_members
  where id = v_bet.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  if v_bet.status != 'active' then
    return jsonb_build_object('error', 'bet_not_active', 'status', v_bet.status::text);
  end if;

  select * into v_league from leagues where id = v_member.league_id;
  select * into v_tournament from tournaments where id = v_league.tournament_id;
  if v_tournament.special_bets_deadline is not null
     and now() >= v_tournament.special_bets_deadline then
    return jsonb_build_object('error', 'deadline_passed');
  end if;

  update special_bets set status = 'cancelled' where id = p_bet_id;

  update league_members
  set special_wallet = special_wallet + v_bet.stake
  where id = v_member.id;

  insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
  values (v_member.id, v_bet.stake, 'special_refund', p_bet_id);

  return jsonb_build_object('ok', true);
end;
$$;


-- ============================================================
-- Migration 0011 — Special market settlement
-- ============================================================

alter type special_bet_status add value if not exists 'won';
alter type special_bet_status add value if not exists 'lost';

alter table special_markets
  add column if not exists result_text text,
  add column if not exists settled_at  timestamptz;

create or replace function settle_special_market(
  p_market_id   uuid,
  p_result_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market     record;
  v_bet        record;
  v_bets_won   int := 0;
  v_bets_lost  int := 0;
  v_total_paid int := 0;
begin
  if p_result_text is null or trim(p_result_text) = '' then
    return jsonb_build_object('error', 'result_text_empty');
  end if;

  select * into v_market
  from special_markets
  where id = p_market_id
  for update;

  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  if v_market.settled_at is not null then
    return jsonb_build_object(
      'error',      'already_settled',
      'settled_at', v_market.settled_at
    );
  end if;

  update special_markets
  set result_text = trim(p_result_text),
      settled_at  = now()
  where id = p_market_id;

  for v_bet in
    select *
    from special_bets
    where market_id = p_market_id
      and status    = 'active'
    for update
  loop
    if lower(trim(v_bet.selection_text)) = lower(trim(p_result_text)) then
      update league_members
      set special_wallet = special_wallet + v_bet.potential_payout
      where id = v_bet.league_member_id;

      insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
      values (v_bet.league_member_id, v_bet.potential_payout, 'special_payout', v_bet.id);

      update special_bets
      set status     = 'won',
          settled_at = now()
      where id = v_bet.id;

      v_bets_won   := v_bets_won + 1;
      v_total_paid := v_total_paid + v_bet.potential_payout;
    else
      update special_bets
      set status     = 'lost',
          settled_at = now()
      where id = v_bet.id;

      v_bets_lost := v_bets_lost + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',         true,
    'bets_won',   v_bets_won,
    'bets_lost',  v_bets_lost,
    'total_paid', v_total_paid
  );
end;
$$;

revoke execute on function settle_special_market(uuid, text) from public;
grant  execute on function settle_special_market(uuid, text) to service_role;


-- ============================================================
-- Migration 0012 — Knockout slot descriptions
-- ============================================================

alter table matches
  add column slot_home text,
  add column slot_away text;

update matches set slot_home = '1A',     slot_away = '2B'     where match_number = 73;
update matches set slot_home = '2A',     slot_away = '1B'     where match_number = 74;
update matches set slot_home = '1C',     slot_away = '2D'     where match_number = 75;
update matches set slot_home = '2C',     slot_away = '1D'     where match_number = 76;
update matches set slot_home = '1E',     slot_away = '2F'     where match_number = 77;
update matches set slot_home = '2E',     slot_away = '1F'     where match_number = 78;
update matches set slot_home = '1G',     slot_away = '2H'     where match_number = 79;
update matches set slot_home = '2G',     slot_away = '1H'     where match_number = 80;
update matches set slot_home = '1I',     slot_away = '2J'     where match_number = 81;
update matches set slot_home = '2I',     slot_away = '1J'     where match_number = 82;
update matches set slot_home = '1K',     slot_away = '2L'     where match_number = 83;
update matches set slot_home = '2K',     slot_away = '1L'     where match_number = 84;
update matches set slot_home = '3top-1', slot_away = '3top-2' where match_number = 85;
update matches set slot_home = '3top-3', slot_away = '3top-4' where match_number = 86;
update matches set slot_home = '3top-5', slot_away = '3top-6' where match_number = 87;
update matches set slot_home = '3top-7', slot_away = '3top-8' where match_number = 88;
update matches set slot_home = 'W73',  slot_away = 'W74'  where match_number = 89;
update matches set slot_home = 'W75',  slot_away = 'W76'  where match_number = 90;
update matches set slot_home = 'W77',  slot_away = 'W78'  where match_number = 91;
update matches set slot_home = 'W79',  slot_away = 'W80'  where match_number = 92;
update matches set slot_home = 'W81',  slot_away = 'W82'  where match_number = 93;
update matches set slot_home = 'W83',  slot_away = 'W84'  where match_number = 94;
update matches set slot_home = 'W85',  slot_away = 'W86'  where match_number = 95;
update matches set slot_home = 'W87',  slot_away = 'W88'  where match_number = 96;
update matches set slot_home = 'W89',  slot_away = 'W90'  where match_number = 97;
update matches set slot_home = 'W91',  slot_away = 'W92'  where match_number = 98;
update matches set slot_home = 'W93',  slot_away = 'W94'  where match_number = 99;
update matches set slot_home = 'W95',  slot_away = 'W96'  where match_number = 100;
update matches set slot_home = 'W97',  slot_away = 'W98'  where match_number = 101;
update matches set slot_home = 'W99',  slot_away = 'W100' where match_number = 102;
update matches set slot_home = 'L101', slot_away = 'L102' where match_number = 103;
update matches set slot_home = 'W101', slot_away = 'W102' where match_number = 104;


-- ============================================================
-- Seed 01 — Turnering och liga
-- ============================================================

insert into tournaments (id, name, status, special_bets_deadline)
values (
  'a1000000-0000-0000-0000-000000000001',
  'FIFA VM 2026',
  'upcoming',
  '2026-06-11 19:00:00+00'
);

insert into leagues (id, name, tournament_id, is_open)
values (
  'b1000000-0000-0000-0000-000000000001',
  'Grabbgänget VM 2026',
  'a1000000-0000-0000-0000-000000000001',
  true
);


-- ============================================================
-- Seed 02 — 48 lag (grupper A–L)
-- ============================================================

insert into teams (id, tournament_id, name, short_name, flag_emoji, group_letter) values
('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'USA',            'USA', '🇺🇸', 'A'),
('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Panama',         'PAN', '🇵🇦', 'A'),
('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Albanien',       'ALB', '🇦🇱', 'A'),
('c1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Ukraina',        'UKR', '🇺🇦', 'A'),
('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Argentina',      'ARG', '🇦🇷', 'B'),
('c1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'Chile',          'CHI', '🇨🇱', 'B'),
('c1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'Peru',           'PER', '🇵🇪', 'B'),
('c1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'Nya Zeeland',    'NZL', '🇳🇿', 'B'),
('c1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'Mexiko',         'MEX', '🇲🇽', 'C'),
('c1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'Jamaica',        'JAM', '🇯🇲', 'C'),
('c1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'Venezuela',      'VEN', '🇻🇪', 'C'),
('c1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'Honduras',       'HON', '🇭🇳', 'C'),
('c1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', 'Spanien',        'ESP', '🇪🇸', 'D'),
('c1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000001', 'Brasilien',      'BRA', '🇧🇷', 'D'),
('c1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000001', 'Japan',          'JPN', '🇯🇵', 'D'),
('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000001', 'Marocko',        'MAR', '🇲🇦', 'D'),
('c1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000001', 'Frankrike',      'FRA', '🇫🇷', 'E'),
('c1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000001', 'Kroatien',       'CRO', '🇭🇷', 'E'),
('c1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000001', 'Serbien',        'SRB', '🇷🇸', 'E'),
('c1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000001', 'Ecuador',        'ECU', '🇪🇨', 'E'),
('c1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000001', 'England',        'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'F'),
('c1000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000001', 'Colombia',       'COL', '🇨🇴', 'F'),
('c1000000-0000-0000-0000-000000000023', 'a1000000-0000-0000-0000-000000000001', 'Senegal',        'SEN', '🇸🇳', 'F'),
('c1000000-0000-0000-0000-000000000024', 'a1000000-0000-0000-0000-000000000001', 'Paraguay',       'PAR', '🇵🇾', 'F'),
('c1000000-0000-0000-0000-000000000025', 'a1000000-0000-0000-0000-000000000001', 'Tyskland',       'GER', '🇩🇪', 'G'),
('c1000000-0000-0000-0000-000000000026', 'a1000000-0000-0000-0000-000000000001', 'Portugal',       'POR', '🇵🇹', 'G'),
('c1000000-0000-0000-0000-000000000027', 'a1000000-0000-0000-0000-000000000001', 'Sydkorea',       'KOR', '🇰🇷', 'G'),
('c1000000-0000-0000-0000-000000000028', 'a1000000-0000-0000-0000-000000000001', 'Costa Rica',     'CRC', '🇨🇷', 'G'),
('c1000000-0000-0000-0000-000000000029', 'a1000000-0000-0000-0000-000000000001', 'Nederländerna',  'NED', '🇳🇱', 'H'),
('c1000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000001', 'Uruguay',        'URU', '🇺🇾', 'H'),
('c1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000001', 'Nigeria',        'NGA', '🇳🇬', 'H'),
('c1000000-0000-0000-0000-000000000032', 'a1000000-0000-0000-0000-000000000001', 'Österrike',      'AUT', '🇦🇹', 'H'),
('c1000000-0000-0000-0000-000000000033', 'a1000000-0000-0000-0000-000000000001', 'Sverige',        'SWE', '🇸🇪', 'I'),
('c1000000-0000-0000-0000-000000000034', 'a1000000-0000-0000-0000-000000000001', 'Schweiz',        'SUI', '🇨🇭', 'I'),
('c1000000-0000-0000-0000-000000000035', 'a1000000-0000-0000-0000-000000000001', 'Elfenbenskusten','CIV', '🇨🇮', 'I'),
('c1000000-0000-0000-0000-000000000036', 'a1000000-0000-0000-0000-000000000001', 'Australien',     'AUS', '🇦🇺', 'I'),
('c1000000-0000-0000-0000-000000000037', 'a1000000-0000-0000-0000-000000000001', 'Kanada',         'CAN', '🇨🇦', 'J'),
('c1000000-0000-0000-0000-000000000038', 'a1000000-0000-0000-0000-000000000001', 'Egypten',        'EGY', '🇪🇬', 'J'),
('c1000000-0000-0000-0000-000000000039', 'a1000000-0000-0000-0000-000000000001', 'Iran',           'IRN', '🇮🇷', 'J'),
('c1000000-0000-0000-0000-000000000040', 'a1000000-0000-0000-0000-000000000001', 'Ghana',          'GHA', '🇬🇭', 'J'),
('c1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000001', 'Italien',        'ITA', '🇮🇹', 'K'),
('c1000000-0000-0000-0000-000000000042', 'a1000000-0000-0000-0000-000000000001', 'Danmark',        'DEN', '🇩🇰', 'K'),
('c1000000-0000-0000-0000-000000000043', 'a1000000-0000-0000-0000-000000000001', 'Turkiet',        'TUR', '🇹🇷', 'K'),
('c1000000-0000-0000-0000-000000000044', 'a1000000-0000-0000-0000-000000000001', 'Polen',          'POL', '🇵🇱', 'K'),
('c1000000-0000-0000-0000-000000000045', 'a1000000-0000-0000-0000-000000000001', 'Belgien',        'BEL', '🇧🇪', 'L'),
('c1000000-0000-0000-0000-000000000046', 'a1000000-0000-0000-0000-000000000001', 'Tunisien',       'TUN', '🇹🇳', 'L'),
('c1000000-0000-0000-0000-000000000047', 'a1000000-0000-0000-0000-000000000001', 'Saudiarabien',   'KSA', '🇸🇦', 'L'),
('c1000000-0000-0000-0000-000000000048', 'a1000000-0000-0000-0000-000000000001', 'Sydafrika',      'RSA', '🇿🇦', 'L');


-- ============================================================
-- Seed 03 — 72 gruppspelsmatcher
-- ============================================================

insert into matches
  (id, tournament_id, match_number, stage, group_letter,
   home_team_id, away_team_id, scheduled_at)
values
('d1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001', 1,'group','A','c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','2026-06-11 23:00:00+00'),
('d1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001', 2,'group','A','c1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000004','2026-06-12 02:00:00+00'),
('d1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001', 3,'group','A','c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003','2026-06-16 23:00:00+00'),
('d1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001', 4,'group','A','c1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000002','2026-06-17 02:00:00+00'),
('d1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001', 5,'group','A','c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000004','2026-06-21 22:00:00+00'),
('d1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001', 6,'group','A','c1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000003','2026-06-21 22:00:00+00'),
('d1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001', 7,'group','B','c1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000006','2026-06-12 20:00:00+00'),
('d1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001', 8,'group','B','c1000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000008','2026-06-12 23:00:00+00'),
('d1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000001', 9,'group','B','c1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000007','2026-06-17 20:00:00+00'),
('d1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000001',10,'group','B','c1000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000006','2026-06-17 23:00:00+00'),
('d1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000001',11,'group','B','c1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000008','2026-06-22 02:00:00+00'),
('d1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000001',12,'group','B','c1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000007','2026-06-22 02:00:00+00'),
('d1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000001',13,'group','C','c1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000010','2026-06-13 00:00:00+00'),
('d1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000001',14,'group','C','c1000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000012','2026-06-13 03:00:00+00'),
('d1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000001',15,'group','C','c1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000011','2026-06-18 00:00:00+00'),
('d1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000001',16,'group','C','c1000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000010','2026-06-18 03:00:00+00'),
('d1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000001',17,'group','C','c1000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000012','2026-06-22 22:00:00+00'),
('d1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000001',18,'group','C','c1000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000011','2026-06-22 22:00:00+00'),
('d1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000001',19,'group','D','c1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000014','2026-06-13 20:00:00+00'),
('d1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000001',20,'group','D','c1000000-0000-0000-0000-000000000015','c1000000-0000-0000-0000-000000000016','2026-06-13 23:00:00+00'),
('d1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000001',21,'group','D','c1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000015','2026-06-18 20:00:00+00'),
('d1000000-0000-0000-0000-000000000022','a1000000-0000-0000-0000-000000000001',22,'group','D','c1000000-0000-0000-0000-000000000016','c1000000-0000-0000-0000-000000000014','2026-06-18 23:00:00+00'),
('d1000000-0000-0000-0000-000000000023','a1000000-0000-0000-0000-000000000001',23,'group','D','c1000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000016','2026-06-23 02:00:00+00'),
('d1000000-0000-0000-0000-000000000024','a1000000-0000-0000-0000-000000000001',24,'group','D','c1000000-0000-0000-0000-000000000014','c1000000-0000-0000-0000-000000000015','2026-06-23 02:00:00+00'),
('d1000000-0000-0000-0000-000000000025','a1000000-0000-0000-0000-000000000001',25,'group','E','c1000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000018','2026-06-14 20:00:00+00'),
('d1000000-0000-0000-0000-000000000026','a1000000-0000-0000-0000-000000000001',26,'group','E','c1000000-0000-0000-0000-000000000019','c1000000-0000-0000-0000-000000000020','2026-06-14 23:00:00+00'),
('d1000000-0000-0000-0000-000000000027','a1000000-0000-0000-0000-000000000001',27,'group','E','c1000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000019','2026-06-19 20:00:00+00'),
('d1000000-0000-0000-0000-000000000028','a1000000-0000-0000-0000-000000000001',28,'group','E','c1000000-0000-0000-0000-000000000020','c1000000-0000-0000-0000-000000000018','2026-06-19 23:00:00+00'),
('d1000000-0000-0000-0000-000000000029','a1000000-0000-0000-0000-000000000001',29,'group','E','c1000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000020','2026-06-23 22:00:00+00'),
('d1000000-0000-0000-0000-000000000030','a1000000-0000-0000-0000-000000000001',30,'group','E','c1000000-0000-0000-0000-000000000018','c1000000-0000-0000-0000-000000000019','2026-06-23 22:00:00+00'),
('d1000000-0000-0000-0000-000000000031','a1000000-0000-0000-0000-000000000001',31,'group','F','c1000000-0000-0000-0000-000000000021','c1000000-0000-0000-0000-000000000022','2026-06-15 00:00:00+00'),
('d1000000-0000-0000-0000-000000000032','a1000000-0000-0000-0000-000000000001',32,'group','F','c1000000-0000-0000-0000-000000000023','c1000000-0000-0000-0000-000000000024','2026-06-15 03:00:00+00'),
('d1000000-0000-0000-0000-000000000033','a1000000-0000-0000-0000-000000000001',33,'group','F','c1000000-0000-0000-0000-000000000021','c1000000-0000-0000-0000-000000000023','2026-06-20 00:00:00+00'),
('d1000000-0000-0000-0000-000000000034','a1000000-0000-0000-0000-000000000001',34,'group','F','c1000000-0000-0000-0000-000000000024','c1000000-0000-0000-0000-000000000022','2026-06-20 03:00:00+00'),
('d1000000-0000-0000-0000-000000000035','a1000000-0000-0000-0000-000000000001',35,'group','F','c1000000-0000-0000-0000-000000000021','c1000000-0000-0000-0000-000000000024','2026-06-24 22:00:00+00'),
('d1000000-0000-0000-0000-000000000036','a1000000-0000-0000-0000-000000000001',36,'group','F','c1000000-0000-0000-0000-000000000022','c1000000-0000-0000-0000-000000000023','2026-06-24 22:00:00+00'),
('d1000000-0000-0000-0000-000000000037','a1000000-0000-0000-0000-000000000001',37,'group','G','c1000000-0000-0000-0000-000000000025','c1000000-0000-0000-0000-000000000026','2026-06-15 20:00:00+00'),
('d1000000-0000-0000-0000-000000000038','a1000000-0000-0000-0000-000000000001',38,'group','G','c1000000-0000-0000-0000-000000000027','c1000000-0000-0000-0000-000000000028','2026-06-15 23:00:00+00'),
('d1000000-0000-0000-0000-000000000039','a1000000-0000-0000-0000-000000000001',39,'group','G','c1000000-0000-0000-0000-000000000025','c1000000-0000-0000-0000-000000000027','2026-06-20 20:00:00+00'),
('d1000000-0000-0000-0000-000000000040','a1000000-0000-0000-0000-000000000001',40,'group','G','c1000000-0000-0000-0000-000000000028','c1000000-0000-0000-0000-000000000026','2026-06-20 23:00:00+00'),
('d1000000-0000-0000-0000-000000000041','a1000000-0000-0000-0000-000000000001',41,'group','G','c1000000-0000-0000-0000-000000000025','c1000000-0000-0000-0000-000000000028','2026-06-25 02:00:00+00'),
('d1000000-0000-0000-0000-000000000042','a1000000-0000-0000-0000-000000000001',42,'group','G','c1000000-0000-0000-0000-000000000026','c1000000-0000-0000-0000-000000000027','2026-06-25 02:00:00+00'),
('d1000000-0000-0000-0000-000000000043','a1000000-0000-0000-0000-000000000001',43,'group','H','c1000000-0000-0000-0000-000000000029','c1000000-0000-0000-0000-000000000030','2026-06-16 00:00:00+00'),
('d1000000-0000-0000-0000-000000000044','a1000000-0000-0000-0000-000000000001',44,'group','H','c1000000-0000-0000-0000-000000000031','c1000000-0000-0000-0000-000000000032','2026-06-16 03:00:00+00'),
('d1000000-0000-0000-0000-000000000045','a1000000-0000-0000-0000-000000000001',45,'group','H','c1000000-0000-0000-0000-000000000029','c1000000-0000-0000-0000-000000000031','2026-06-21 00:00:00+00'),
('d1000000-0000-0000-0000-000000000046','a1000000-0000-0000-0000-000000000001',46,'group','H','c1000000-0000-0000-0000-000000000032','c1000000-0000-0000-0000-000000000030','2026-06-21 03:00:00+00'),
('d1000000-0000-0000-0000-000000000047','a1000000-0000-0000-0000-000000000001',47,'group','H','c1000000-0000-0000-0000-000000000029','c1000000-0000-0000-0000-000000000032','2026-06-25 22:00:00+00'),
('d1000000-0000-0000-0000-000000000048','a1000000-0000-0000-0000-000000000001',48,'group','H','c1000000-0000-0000-0000-000000000030','c1000000-0000-0000-0000-000000000031','2026-06-25 22:00:00+00'),
('d1000000-0000-0000-0000-000000000049','a1000000-0000-0000-0000-000000000001',49,'group','I','c1000000-0000-0000-0000-000000000033','c1000000-0000-0000-0000-000000000034','2026-06-16 20:00:00+00'),
('d1000000-0000-0000-0000-000000000050','a1000000-0000-0000-0000-000000000001',50,'group','I','c1000000-0000-0000-0000-000000000035','c1000000-0000-0000-0000-000000000036','2026-06-16 23:00:00+00'),
('d1000000-0000-0000-0000-000000000051','a1000000-0000-0000-0000-000000000001',51,'group','I','c1000000-0000-0000-0000-000000000033','c1000000-0000-0000-0000-000000000035','2026-06-21 20:00:00+00'),
('d1000000-0000-0000-0000-000000000052','a1000000-0000-0000-0000-000000000001',52,'group','I','c1000000-0000-0000-0000-000000000036','c1000000-0000-0000-0000-000000000034','2026-06-21 23:00:00+00'),
('d1000000-0000-0000-0000-000000000053','a1000000-0000-0000-0000-000000000001',53,'group','I','c1000000-0000-0000-0000-000000000033','c1000000-0000-0000-0000-000000000036','2026-06-26 02:00:00+00'),
('d1000000-0000-0000-0000-000000000054','a1000000-0000-0000-0000-000000000001',54,'group','I','c1000000-0000-0000-0000-000000000034','c1000000-0000-0000-0000-000000000035','2026-06-26 02:00:00+00'),
('d1000000-0000-0000-0000-000000000055','a1000000-0000-0000-0000-000000000001',55,'group','J','c1000000-0000-0000-0000-000000000037','c1000000-0000-0000-0000-000000000038','2026-06-17 00:00:00+00'),
('d1000000-0000-0000-0000-000000000056','a1000000-0000-0000-0000-000000000001',56,'group','J','c1000000-0000-0000-0000-000000000039','c1000000-0000-0000-0000-000000000040','2026-06-17 03:00:00+00'),
('d1000000-0000-0000-0000-000000000057','a1000000-0000-0000-0000-000000000001',57,'group','J','c1000000-0000-0000-0000-000000000037','c1000000-0000-0000-0000-000000000039','2026-06-22 00:00:00+00'),
('d1000000-0000-0000-0000-000000000058','a1000000-0000-0000-0000-000000000001',58,'group','J','c1000000-0000-0000-0000-000000000040','c1000000-0000-0000-0000-000000000038','2026-06-22 03:00:00+00'),
('d1000000-0000-0000-0000-000000000059','a1000000-0000-0000-0000-000000000001',59,'group','J','c1000000-0000-0000-0000-000000000037','c1000000-0000-0000-0000-000000000040','2026-06-26 22:00:00+00'),
('d1000000-0000-0000-0000-000000000060','a1000000-0000-0000-0000-000000000001',60,'group','J','c1000000-0000-0000-0000-000000000038','c1000000-0000-0000-0000-000000000039','2026-06-26 22:00:00+00'),
('d1000000-0000-0000-0000-000000000061','a1000000-0000-0000-0000-000000000001',61,'group','K','c1000000-0000-0000-0000-000000000041','c1000000-0000-0000-0000-000000000042','2026-06-17 20:00:00+00'),
('d1000000-0000-0000-0000-000000000062','a1000000-0000-0000-0000-000000000001',62,'group','K','c1000000-0000-0000-0000-000000000043','c1000000-0000-0000-0000-000000000044','2026-06-17 23:00:00+00'),
('d1000000-0000-0000-0000-000000000063','a1000000-0000-0000-0000-000000000001',63,'group','K','c1000000-0000-0000-0000-000000000041','c1000000-0000-0000-0000-000000000043','2026-06-22 20:00:00+00'),
('d1000000-0000-0000-0000-000000000064','a1000000-0000-0000-0000-000000000001',64,'group','K','c1000000-0000-0000-0000-000000000044','c1000000-0000-0000-0000-000000000042','2026-06-22 23:00:00+00'),
('d1000000-0000-0000-0000-000000000065','a1000000-0000-0000-0000-000000000001',65,'group','K','c1000000-0000-0000-0000-000000000041','c1000000-0000-0000-0000-000000000044','2026-06-27 02:00:00+00'),
('d1000000-0000-0000-0000-000000000066','a1000000-0000-0000-0000-000000000001',66,'group','K','c1000000-0000-0000-0000-000000000042','c1000000-0000-0000-0000-000000000043','2026-06-27 02:00:00+00'),
('d1000000-0000-0000-0000-000000000067','a1000000-0000-0000-0000-000000000001',67,'group','L','c1000000-0000-0000-0000-000000000045','c1000000-0000-0000-0000-000000000046','2026-06-18 00:00:00+00'),
('d1000000-0000-0000-0000-000000000068','a1000000-0000-0000-0000-000000000001',68,'group','L','c1000000-0000-0000-0000-000000000047','c1000000-0000-0000-0000-000000000048','2026-06-18 03:00:00+00'),
('d1000000-0000-0000-0000-000000000069','a1000000-0000-0000-0000-000000000001',69,'group','L','c1000000-0000-0000-0000-000000000045','c1000000-0000-0000-0000-000000000047','2026-06-23 00:00:00+00'),
('d1000000-0000-0000-0000-000000000070','a1000000-0000-0000-0000-000000000001',70,'group','L','c1000000-0000-0000-0000-000000000048','c1000000-0000-0000-0000-000000000046','2026-06-23 03:00:00+00'),
('d1000000-0000-0000-0000-000000000071','a1000000-0000-0000-0000-000000000001',71,'group','L','c1000000-0000-0000-0000-000000000045','c1000000-0000-0000-0000-000000000048','2026-06-27 22:00:00+00'),
('d1000000-0000-0000-0000-000000000072','a1000000-0000-0000-0000-000000000001',72,'group','L','c1000000-0000-0000-0000-000000000046','c1000000-0000-0000-0000-000000000047','2026-06-27 22:00:00+00');


-- ============================================================
-- Seed 04 — 32 slutspelsslots (platshållare)
-- ============================================================

insert into matches
  (id, tournament_id, match_number, stage,
   home_team_id, away_team_id, scheduled_at)
values
('d2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001', 73,'r32',null,null,'2026-06-29 23:00:00+00'),
('d2000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001', 74,'r32',null,null,'2026-06-30 02:00:00+00'),
('d2000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001', 75,'r32',null,null,'2026-06-30 23:00:00+00'),
('d2000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001', 76,'r32',null,null,'2026-07-01 02:00:00+00'),
('d2000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001', 77,'r32',null,null,'2026-07-01 23:00:00+00'),
('d2000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001', 78,'r32',null,null,'2026-07-02 02:00:00+00'),
('d2000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001', 79,'r32',null,null,'2026-07-02 23:00:00+00'),
('d2000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001', 80,'r32',null,null,'2026-07-03 02:00:00+00'),
('d2000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000001', 81,'r32',null,null,'2026-07-03 23:00:00+00'),
('d2000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000001', 82,'r32',null,null,'2026-07-04 02:00:00+00'),
('d2000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000001', 83,'r32',null,null,'2026-07-04 23:00:00+00'),
('d2000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000001', 84,'r32',null,null,'2026-07-05 02:00:00+00'),
('d2000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000001', 85,'r32',null,null,'2026-07-05 23:00:00+00'),
('d2000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000001', 86,'r32',null,null,'2026-07-06 02:00:00+00'),
('d2000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000001', 87,'r32',null,null,'2026-07-06 23:00:00+00'),
('d2000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000001', 88,'r32',null,null,'2026-07-07 02:00:00+00'),
('d3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001', 89,'r16',null,null,'2026-07-08 23:00:00+00'),
('d3000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001', 90,'r16',null,null,'2026-07-09 02:00:00+00'),
('d3000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001', 91,'r16',null,null,'2026-07-09 23:00:00+00'),
('d3000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001', 92,'r16',null,null,'2026-07-10 02:00:00+00'),
('d3000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000001', 93,'r16',null,null,'2026-07-10 23:00:00+00'),
('d3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001', 94,'r16',null,null,'2026-07-11 02:00:00+00'),
('d3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001', 95,'r16',null,null,'2026-07-11 23:00:00+00'),
('d3000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001', 96,'r16',null,null,'2026-07-12 02:00:00+00'),
('d4000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001', 97,'qf', null,null,'2026-07-14 23:00:00+00'),
('d4000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001', 98,'qf', null,null,'2026-07-15 02:00:00+00'),
('d4000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001', 99,'qf', null,null,'2026-07-15 23:00:00+00'),
('d4000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000001',100,'qf', null,null,'2026-07-16 02:00:00+00'),
('d5000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',101,'sf', null,null,'2026-07-15 23:00:00+00'),
('d5000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001',102,'sf', null,null,'2026-07-16 23:00:00+00'),
('d6000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',103,'3rd_place',null,null,'2026-07-18 23:00:00+00'),
('d7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',104,'final',    null,null,'2026-07-19 20:00:00+00');


-- ============================================================
-- Seed 05 — Specialbet-marknader
-- ============================================================

insert into special_markets (tournament_id, type, label, odds, fixed_payout_factor, set_by)
values
  ('a1000000-0000-0000-0000-000000000001', 'vm_vinnare',  'VM-vinnare',                 null, null, null),
  ('a1000000-0000-0000-0000-000000000001', 'skyttekung',  'Bästa målskytt',             null, null, null),
  ('a1000000-0000-0000-0000-000000000001', 'sverige_mal', 'Sveriges mål i gruppspelet', null, 4.0,  null)
on conflict (tournament_id, type) do nothing;


-- ============================================================
-- Migration 0013 — Explicit GRANT for user-facing betting RPCs
-- ============================================================

grant execute on function place_bet_slip(uuid, int, jsonb) to authenticated;
grant execute on function cancel_bet_slip(uuid)            to authenticated;
grant execute on function amend_bet_slip(uuid, int, jsonb) to authenticated;


-- ============================================================
-- Migration 0014 — Fix member wallets to correct starting capital
-- ============================================================

update league_members lm
set
  match_wallet   = 5000,
  special_wallet = 1000
where
  (lm.match_wallet != 5000 or lm.special_wallet != 1000)
  and not exists (
    select 1 from match_wallet_transactions mwt where mwt.league_member_id = lm.id
  )
  and not exists (
    select 1 from special_bets sb
    where sb.league_member_id = lm.id and sb.status not in ('cancelled')
  );

-- ============================================================
-- Table GRANTs — service_role (cron/admin) + authenticated (users)
-- ============================================================

grant usage  on schema public                    to service_role;
grant all    on all tables    in schema public   to service_role;
grant all    on all sequences in schema public   to service_role;

grant usage  on schema public                    to authenticated;
grant select on matches, teams, tournaments      to authenticated;
grant select on leagues, league_members          to authenticated;
grant select on profiles, invite_whitelist       to authenticated;
grant select on match_odds                       to authenticated;
grant select, insert, update, delete
  on bet_slips, bet_slip_selections              to authenticated;
grant select, insert
  on match_wallet_transactions                   to authenticated;
grant select on special_markets                  to authenticated;
grant select, insert, update, delete
  on special_bets                                to authenticated;
grant select, insert
  on special_wallet_transactions                 to authenticated;
grant select, insert
  on audit_log                                   to authenticated;

alter default privileges in schema public
  grant all on tables    to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select on tables to authenticated;
