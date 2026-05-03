-- ============================================================
-- Migration 0020 — outright_odds table + per-selection RPC odds
-- ============================================================
-- Adds outright_odds to store per-selection odds (VM-vinnare,
-- skyttekung) synced from The Odds API.
--
-- Updates place_special_bet to look up per-selection odds from
-- outright_odds for vm_vinnare/skyttekung. Falls back to
-- special_markets.odds if no outright row exists (backward compat).
--
-- Also extends sync_log.type CHECK to allow 'outrights'.
-- ============================================================

-- ─── Extend sync_log type constraint ─────────────────────────

alter table sync_log
  drop constraint if exists sync_log_type_check;

alter table sync_log
  add constraint sync_log_type_check
  check (type in ('odds', 'results', 'outrights'));

-- ─── outright_odds ────────────────────────────────────────────

create table outright_odds (
  id         uuid        primary key default gen_random_uuid(),
  market_id  uuid        not null references special_markets(id) on delete cascade,
  selection  text        not null,
  odds       numeric     not null check (odds > 1.0),
  source     text        not null default 'the-odds-api',
  synced_at  timestamptz not null default now(),
  unique(market_id, selection)
);

alter table outright_odds enable row level security;

create policy "outright_odds: authenticated read"
  on outright_odds for select to authenticated
  using (true);

create policy "outright_odds: admin manage"
  on outright_odds for all to authenticated
  using (is_any_admin())
  with check (is_any_admin());

-- ─── place_special_bet — updated to use per-selection odds ────

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
  v_outright_odds  numeric;
begin
  -- 1. Lock member row for the duration of the transaction
  select * into v_member
  from league_members
  where id = p_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- 2. Caller must own this member record
  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- 3. League must be open
  select * into v_league from leagues where id = v_member.league_id;
  if not found or not v_league.is_open then
    return jsonb_build_object('error', 'league_closed');
  end if;

  -- 4. Deadline check: reject if deadline has passed
  select * into v_tournament from tournaments where id = v_league.tournament_id;
  if v_tournament.special_bets_deadline is not null
     and now() >= v_tournament.special_bets_deadline then
    return jsonb_build_object('error', 'deadline_passed');
  end if;

  -- 5. Minimum stake
  if p_stake < 100 then
    return jsonb_build_object('error', 'stake_too_low');
  end if;

  -- 6. Fetch market
  select * into v_market from special_markets where id = p_market_id;
  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  -- 7. Resolve effective odds; detect stale odds for variable markets.
  if v_market.type in ('vm_vinnare', 'skyttekung') then
    -- Check outright_odds first: per-selection odds synced from The Odds API.
    select odds into v_outright_odds
    from outright_odds
    where market_id = p_market_id
      and lower(trim(selection)) = lower(trim(p_selection_text));

    if found then
      if v_outright_odds != p_odds_snapshot then
        return jsonb_build_object(
          'error',        'odds_changed',
          'current_odds', v_outright_odds
        );
      end if;
      v_effective_odds := v_outright_odds;
    else
      -- Fall back to single market-level odds (admin-set or legacy)
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
    end if;
  else
    -- sverige_mal: use fixed_payout_factor (always 4.0 per spec)
    v_effective_odds := v_market.fixed_payout_factor;
  end if;

  -- 8. Find and lock any existing active bet for this (member, market) pair
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

  -- 9. Balance check against effective balance
  if v_effective_bal < p_stake then
    return jsonb_build_object(
      'error',   'insufficient_balance',
      'balance', v_effective_bal
    );
  end if;

  -- 10. Supersede the existing bet when amending
  if v_has_existing then
    update special_bets set status = 'superseded' where id = v_existing_bet.id;
  end if;

  -- 11. Compute potential payout
  v_payout := floor(p_stake::numeric * v_effective_odds);

  -- 12. Insert the new bet version
  insert into special_bets (
    league_member_id, market_id, version,
    selection_text, stake, odds_snapshot, potential_payout, status
  )
  values (
    p_member_id, p_market_id, v_new_version,
    p_selection_text, p_stake, v_effective_odds, v_payout, 'active'
  )
  returning id into v_new_bet_id;

  -- 13. Update special_wallet
  update league_members
  set special_wallet = v_effective_bal - p_stake
  where id = p_member_id;

  -- 14. Ledger entries
  if v_has_existing then
    insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
    values (p_member_id, v_existing_bet.stake, 'special_refund', v_existing_bet.id);
  end if;

  insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
  values (p_member_id, -p_stake, 'special_stake', v_new_bet_id);

  -- 15. Return success
  return jsonb_build_object(
    'ok',              true,
    'special_bet_id',  v_new_bet_id,
    'version',         v_new_version,
    'odds_snapshot',   v_effective_odds,
    'potential_payout', v_payout
  );
end;
$$;
