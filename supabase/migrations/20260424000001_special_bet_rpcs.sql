-- ============================================================
-- Migration 0010 — Specialbet RPCs (fas 7B.1)
-- ============================================================
-- place_special_bet  — atomic placement or amendment of a special bet.
-- cancel_special_bet — atomic cancellation with full stake refund.
--
-- Both are SECURITY DEFINER and verify auth.uid() ownership.
--
-- Versioning model:
--   • First placement: status='active', version=1.
--   • Amendment: old row → 'superseded', new row → 'active', version++.
--   • Partial unique index special_bets_one_active ensures at most one
--     active bet per (league_member_id, market_id) at all times.
--
-- Odds-change detection (vm_vinnare / skyttekung only):
--   • Caller passes p_odds_snapshot (odds shown when user loaded the form).
--   • If current special_markets.odds differs from snapshot → odds_changed
--     is returned and no writes occur. The caller must reload the current
--     odds and ask the user to confirm before retrying.
--   • sverige_mal uses a fixed factor (4.0) → no odds_changed check.
--
-- Wallet semantics on amendment:
--   • Effective balance = current special_wallet + old_bet.stake (refund).
--   • Net wallet change = new_stake - old_stake.
--   • Ledger: special_refund(+old_stake) + special_stake(-new_stake).
-- ============================================================

-- ─── place_special_bet ────────────────────────────────────────

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
  --    For vm_vinnare/skyttekung: if admin changed odds since the client
  --    loaded the page, roll back and tell the caller the current value.
  --    For sverige_mal: fixed factor — no odds_changed check.
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
    -- sverige_mal: use fixed_payout_factor (always 4.0 per spec)
    v_effective_odds := v_market.fixed_payout_factor;
  end if;

  -- 8. Find and lock any existing active bet for this (member, market) pair.
  --    Locking here prevents a concurrent call from racing on the same bet.
  select * into v_existing_bet
  from special_bets
  where league_member_id = p_member_id
    and market_id         = p_market_id
    and status            = 'active'
  for update;

  if found then
    v_has_existing  := true;
    -- Effective balance includes the stake that will be refunded
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

  -- 13. Update special_wallet: net = effective_balance - new_stake
  update league_members
  set special_wallet = v_effective_bal - p_stake
  where id = p_member_id;

  -- 14. Ledger entries
  if v_has_existing then
    -- Refund old stake first, then record the new debit
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

-- ─── cancel_special_bet ───────────────────────────────────────

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
  -- 1. Fetch and lock the bet
  select * into v_bet
  from special_bets
  where id = p_bet_id
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- 2. Fetch and lock the member
  select * into v_member
  from league_members
  where id = v_bet.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- 3. Caller must own this bet
  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- 4. Only active bets can be cancelled
  if v_bet.status != 'active' then
    return jsonb_build_object('error', 'bet_not_active', 'status', v_bet.status::text);
  end if;

  -- 5. Deadline check
  select * into v_league from leagues where id = v_member.league_id;
  select * into v_tournament from tournaments where id = v_league.tournament_id;
  if v_tournament.special_bets_deadline is not null
     and now() >= v_tournament.special_bets_deadline then
    return jsonb_build_object('error', 'deadline_passed');
  end if;

  -- 6. Cancel the bet
  update special_bets set status = 'cancelled' where id = p_bet_id;

  -- 7. Refund stake to special_wallet
  update league_members
  set special_wallet = special_wallet + v_bet.stake
  where id = v_member.id;

  -- 8. Ledger entry
  insert into special_wallet_transactions (league_member_id, amount, type, special_bet_id)
  values (v_member.id, v_bet.stake, 'special_refund', p_bet_id);

  return jsonb_build_object('ok', true);
end;
$$;
