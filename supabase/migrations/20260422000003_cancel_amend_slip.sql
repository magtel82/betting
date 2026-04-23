-- ============================================================
-- Migration 0006 — cancel_bet_slip + amend_bet_slip RPCs (fas 5D)
-- ============================================================
-- cancel_bet_slip: atomically cancels an open slip and refunds stake.
-- amend_bet_slip:  cancel + new placement in a single transaction.
--
-- Both functions are SECURITY DEFINER and verify auth.uid() ownership.
-- amend_bet_slip intentionally does all validation BEFORE any writes,
-- so odds_changed errors roll back the entire transaction — the old
-- slip stays intact and the caller can retry with updated odds.
-- ============================================================

-- ─── cancel_bet_slip ─────────────────────────────────────────
-- Cancels an open slip and refunds the stake.
-- Guards:
--   • caller must own the slip (via auth.uid())
--   • slip must be status='open'
--   • no match in the slip may have started (scheduled_at > now())
-- On success: slip→cancelled, match_wallet += stake, ledger entry inserted.

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
  -- 1. Fetch and lock the slip
  select * into v_slip from bet_slips where id = p_slip_id for update;
  if not found then
    return jsonb_build_object('error', 'slip_not_found');
  end if;

  -- 2. Fetch and lock the member (we need match_wallet update)
  select * into v_member
  from league_members
  where id = v_slip.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- 3. Caller must own this slip
  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- 4. Slip must be open
  if v_slip.status != 'open' then
    return jsonb_build_object('error', 'slip_not_open', 'status', v_slip.status::text);
  end if;

  -- 5. No match in the slip may have started
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

  -- 6. Cancel the slip
  update bet_slips set status = 'cancelled' where id = p_slip_id;

  -- 7. Refund stake to match_wallet
  update league_members
  set match_wallet = match_wallet + v_slip.stake
  where id = v_member.id;

  -- 8. Record the refund in the ledger
  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, v_slip.stake, 'bet_refund', p_slip_id);

  return jsonb_build_object('ok', true, 'refunded', v_slip.stake);
end;
$$;


-- ─── amend_bet_slip ──────────────────────────────────────────
-- Atomically cancels an old slip and places a new one.
-- All validation (including odds_changed) runs BEFORE any writes.
-- If new selections fail validation, the old slip is untouched.
--
-- Stake limit for the new slip is computed against the effective
-- balance: match_wallet + old_stake (because the refund is included
-- in the same transaction).
--
-- Returns same shape as place_bet_slip on success.

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
begin
  -- ── Phase 1: validate old slip ──────────────────────────────

  -- 1. Fetch and lock old slip
  select * into v_old_slip from bet_slips where id = p_old_slip_id for update;
  if not found then
    return jsonb_build_object('error', 'slip_not_found');
  end if;

  -- 2. Fetch and lock member
  select * into v_member
  from league_members
  where id = v_old_slip.league_member_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('error', 'member_not_found');
  end if;

  -- 3. Verify caller owns the old slip
  if v_member.user_id != auth.uid() then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- 4. Old slip must be open
  if v_old_slip.status != 'open' then
    return jsonb_build_object('error', 'slip_not_open', 'status', v_old_slip.status::text);
  end if;

  -- 5. No match in old slip may have started
  for v_sel in
    select bss.match_id, m.scheduled_at
    from bet_slip_selections bss
    join matches m on m.id = bss.match_id
    where bss.slip_id = p_old_slip_id
  loop
    if v_sel.scheduled_at <= now() then
      return jsonb_build_object('error', 'match_already_started', 'match_id', v_sel.match_id);
    end if;
  end loop;

  -- 6. League must be open
  if not exists(select 1 from leagues where id = v_member.league_id and is_open = true) then
    return jsonb_build_object('error', 'league_closed');
  end if;

  -- ── Phase 2: validate new selections ────────────────────────

  -- 7. Selection count: 1–5
  v_sel_count := jsonb_array_length(p_selections);
  if v_sel_count < 1 or v_sel_count > 5 then
    return jsonb_build_object('error', 'invalid_selection_count');
  end if;

  -- 8. Stake validation against effective balance (current + old stake refund)
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

  -- 9. Validate each new selection + build combined odds
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
      -- All validation has run before any writes, so if odds changed the old
      -- slip is still intact and the caller can retry with updated odds.
      return jsonb_build_object(
        'error',     'odds_changed',
        'match_id',  v_match_id,
        'submitted', v_submitted,
        'current',   v_current
      );
    end if;

    v_combined := v_combined * v_current;
  end loop;

  -- ── Phase 3: commit writes (all-or-nothing) ──────────────────

  -- 10. Compute potential payout
  v_potential := floor(p_stake * v_combined);

  -- 11. Cancel old slip
  update bet_slips set status = 'cancelled' where id = p_old_slip_id;

  -- 12. Net wallet change: +old_stake −new_stake
  update league_members
  set match_wallet = match_wallet + v_old_slip.stake - p_stake
  where id = v_member.id;

  -- 13. Ledger: refund old stake
  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, v_old_slip.stake, 'bet_refund', p_old_slip_id);

  -- 14. Create new slip
  insert into bet_slips (league_member_id, stake, combined_odds, potential_payout, status)
  values (v_member.id, p_stake, v_combined, v_potential, 'open')
  returning id into v_slip_id;

  -- 15. Create selections (re-read odds from DB — never trust submitted values)
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

  -- 16. Ledger: debit new stake
  insert into match_wallet_transactions (league_member_id, amount, type, slip_id)
  values (v_member.id, -p_stake, 'bet_stake', v_slip_id);

  return jsonb_build_object(
    'ok',              true,
    'slip_id',         v_slip_id,
    'combined_odds',   v_combined,
    'potential_payout', v_potential,
    'refunded',        v_old_slip.stake
  );
end;
$$;
