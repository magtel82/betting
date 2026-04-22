-- ============================================================
-- Migration 0005 — Matchbetting schema (fas 5A)
-- ============================================================
-- Tables: bet_slips, bet_slip_selections, match_wallet_transactions
-- RLS: players see all slips in their league; own transactions only
-- RPC: place_bet_slip — atomic slip placement
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

create type slip_status as enum ('open', 'locked', 'won', 'lost', 'void', 'cancelled');
create type bet_status  as enum ('open', 'won', 'lost', 'void', 'cancelled');

-- Wallet transaction types for match_wallet ledger.
-- All types except bet_stake are created in future phases; enum defined here
-- so the ledger table is complete from the start.
create type wallet_tx_type as enum (
  'bet_stake',       -- slip placed: debit (fas 5)
  'bet_payout',      -- won slip settled: credit (fas 6)
  'bet_refund',      -- cancelled/void slip: credit (fas 6)
  'inactivity_fee',  -- daily fee for inactive players (fas 6)
  'group_bonus',     -- end-of-group-stage bonus (fas 6)
  'admin_adjust'     -- manual adjustment by admin (fas 6+)
);

-- ─── bet_slips ───────────────────────────────────────────────
-- One row per placed slip. combined_odds and potential_payout are
-- computed at placement time and stored as snapshots.
-- potential_payout = floor(stake * combined_odds).

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

-- ─── bet_slip_selections ─────────────────────────────────────
-- One row per match within a slip.
-- odds_snapshot: the market odds at the moment of placement (never changes).
-- unique(slip_id, match_id): enforces max one selection per match per slip.

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

-- ─── match_wallet_transactions ───────────────────────────────
-- Ledger for match_wallet movements. The authoritative balance is
-- league_members.match_wallet; this table provides the audit trail
-- and enables idempotent settlement in fas 6.
-- amount: positive = credit, negative = debit.

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

-- ─── RLS ─────────────────────────────────────────────────────

alter table bet_slips                enable row level security;
alter table bet_slip_selections      enable row level security;
alter table match_wallet_transactions enable row level security;

-- bet_slips: all league members see all slips in their league
-- (spec: "Alla spelare ser allas matchslip direkt")
create policy "bet_slips: league members can read"
  on bet_slips for select to authenticated
  using (
    is_league_member(
      (select league_id from league_members where id = bet_slips.league_member_id)
    )
  );

-- Admin can read all slips (needed for admin panel in later phases)
create policy "bet_slips: admin can read all"
  on bet_slips for all to authenticated
  using     (is_any_admin())
  with check (is_any_admin());

-- bet_slip_selections: same visibility as parent slip
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

-- match_wallet_transactions: players see only their own; admin sees all
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

-- ─── place_bet_slip RPC ───────────────────────────────────────
-- Atomically places a matchslip. All validation, stake deduction,
-- and inserts happen inside a single DB transaction.
--
-- p_league_member_id: the caller's league_members.id
-- p_stake:            coins to wager (integer)
-- p_selections:       [{match_id, outcome, odds_snapshot}]
--
-- Returns:
--   success: {ok: true, slip_id, combined_odds, potential_payout}
--   failure: {error: <code>, ...details}
--
-- Security model:
--   SECURITY DEFINER — runs with elevated DB privileges so it can
--   write to tables the player has no direct INSERT/UPDATE policy on.
--   auth.uid() is still the calling user — ownership is verified explicitly.
--   Called from user-authenticated Supabase client (not service role).

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
  -- 1. Lock and fetch member row (FOR UPDATE prevents race conditions
  --    where two concurrent bets would both see the same balance)
  select * into v_member
  from league_members
  where id = p_league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- 2. Verify caller owns this membership
  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- 3. League must be open for betting
  if not exists(
    select 1 from leagues where id = v_member.league_id and is_open = true
  ) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  -- 4. Selection count: 1–5
  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  -- 5. Stake validation
  --    max_stake = floor(match_wallet * 0.3), minimum 10
  v_max_stake := floor(v_member.match_wallet * 0.3);
  if p_stake < 10 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;
  if p_stake > v_max_stake then
    return jsonb_build_object('error', 'stake_exceeds_limit',
                              'max_stake', v_max_stake,
                              'balance',   v_member.match_wallet);
  end if;
  -- Redundant given the 30% check above, but explicit guard against under-0
  if p_stake > v_member.match_wallet then
    return jsonb_build_object('error', 'insufficient_balance',
                              'balance', v_member.match_wallet);
  end if;

  -- 6. Validate each selection and compute combined odds
  for v_sel in select * from jsonb_array_elements(p_selections) loop
    v_match_id := (v_sel->>'match_id')::uuid;
    v_outcome  := v_sel->>'outcome';

    -- Outcome must be home | draw | away
    if v_outcome not in ('home', 'draw', 'away') then
      return jsonb_build_object('error', 'invalid_outcome', 'match_id', v_match_id);
    end if;

    -- Match must exist
    select * into v_match from matches where id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'match_not_found', 'match_id', v_match_id);
    end if;

    -- Match must be scheduled and not yet started
    if v_match.status != 'scheduled' or v_match.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_not_bettable', 'match_id', v_match_id);
    end if;

    -- Current odds must exist
    select * into v_odds_row from match_odds where match_id = v_match_id;
    if not found then
      return jsonb_build_object('error', 'no_odds', 'match_id', v_match_id);
    end if;

    -- Resolve the current odds for the requested outcome
    case v_outcome
      when 'home' then v_current_odds := v_odds_row.home_odds;
      when 'draw' then v_current_odds := v_odds_row.draw_odds;
      when 'away' then v_current_odds := v_odds_row.away_odds;
    end case;

    -- Submitted odds must exactly match DB odds (stale odds require re-confirmation)
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

  -- 7. Compute potential payout (floor to whole coins)
  v_potential_pay := floor(p_stake * v_combined_odds);

  -- 8. Deduct stake from match_wallet
  --    The check(match_wallet >= 0) constraint on league_members acts as
  --    a final safety net against any concurrent race that slipped through.
  update league_members
  set match_wallet = match_wallet - p_stake
  where id = p_league_member_id;

  -- 9. Create slip
  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (p_league_member_id, p_stake, v_combined_odds, v_potential_pay, 'open')
  returning id into v_slip_id;

  -- 10. Create selections
  --     Odds are re-read from DB here (not trusted from p_selections) to
  --     guarantee the stored snapshot matches the odds used in the calculation.
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

  -- 11. Record the wallet debit in the ledger
  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (p_league_member_id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',             true,
    'slip_id',        v_slip_id,
    'combined_odds',  v_combined_odds,
    'potential_payout', v_potential_pay
  );
end;
$$;
