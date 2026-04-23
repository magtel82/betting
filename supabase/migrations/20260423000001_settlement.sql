-- ============================================================
-- Migration 0007 — Settlement engine (fas 6A)
-- ============================================================
-- Adds final_odds to bet_slips for void-adjusted odds tracking.
-- Creates settle_match() RPC — idempotent, atomic settlement
-- for all open/locked slips that contain a selection on the
-- given match.
--
-- Callable only via service role (admin actions). Revoked from
-- authenticated/anon to prevent player-triggered settlement.
-- ============================================================

-- ─── Schema change ───────────────────────────────────────────
-- final_odds: the actual combined odds used for payout, after
-- removing voided selections. NULL until the slip is settled.
-- Differs from combined_odds (placement snapshot) when any
-- selection was voided. Used for statistics and tie-breakers.

alter table bet_slips
  add column final_odds numeric(10,4);

-- ─── settle_match ────────────────────────────────────────────
-- Atomically settles all open/locked selections for p_match_id
-- and then finalises any slip where every selection is decided.
--
-- Phase 1 — validate match (must be 'finished' or 'void').
-- Phase 2 — mark selections won/lost/void.
-- Phase 3 — for each affected slip where ALL selections are
--           now decided, lock and settle:
--             all void         → slip void, refund stake
--             any lost         → slip lost, no payout
--             all non-void won → slip won, payout = floor(stake × final_odds)
--
-- Idempotency:
--   Phase 2 only touches selections with status='open'.
--   Phase 3 only touches slips with status in ('open','locked').
--   Running again after full settlement is a safe no-op.

create or replace function settle_match(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match              record;
  v_outcome            text;       -- 'home'|'draw'|'away'|null (void)
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
  -- ── Phase 1: validate match ────────────────────────────────

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

  -- Determine actual outcome (null = voided match)
  if v_match.status = 'void' then
    v_outcome := null;
  elsif v_match.home_score > v_match.away_score then
    v_outcome := 'home';
  elsif v_match.away_score > v_match.home_score then
    v_outcome := 'away';
  else
    v_outcome := 'draw';
  end if;

  -- ── Phase 2: mark selections won / lost / void ─────────────

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

  -- ── Phase 3: finalise slips where all selections are decided ─

  for v_slip_id in
    select distinct bss.slip_id
    from bet_slip_selections bss
    join bet_slips bs on bs.id = bss.slip_id
    where bss.match_id = p_match_id
      and bs.status     in ('open', 'locked')
  loop
    -- Are all selections in this slip settled?
    select
      bool_and(bss.status != 'open') as all_settled,
      bool_and(bss.status  = 'void') as all_void,
      bool_or (bss.status  = 'lost') as any_lost
    into v_all_settled, v_all_void, v_any_lost
    from bet_slip_selections bss
    where bss.slip_id = v_slip_id;

    -- Skip if this slip still has unresolved selections
    -- (another match in the slip is not yet finished)
    if not v_all_settled then
      continue;
    end if;

    -- Lock slip for update and re-check status (idempotency guard)
    select * into v_slip from bet_slips where id = v_slip_id for update;
    if v_slip.status not in ('open', 'locked') then
      continue; -- already settled in a previous call
    end if;

    -- Lock member row for wallet mutation
    select * into v_member from league_members
    where id = v_slip.league_member_id for update;

    -- Settle the slip
    if v_all_void then
      -- ── All selections voided → refund full stake ───────────
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
      -- ── At least one non-void selection lost ─────────────────
      update bet_slips
      set status     = 'lost',
          settled_at = now(),
          final_odds = null,
          updated_at = now()
      where id = v_slip_id;

      v_slips_lost := v_slips_lost + 1;

    else
      -- ── All non-void selections won ───────────────────────────
      -- Compute final odds as product of winning selections' odds.
      -- Uses EXP(SUM(LN(x))) — the standard SQL product aggregate.
      -- All odds > 1.0 by constraint, so LN is safe.
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

-- Only service_role may call settle_match.
-- Authenticated players cannot trigger settlement directly.
revoke execute on function settle_match(uuid) from public;
grant  execute on function settle_match(uuid) to service_role;
