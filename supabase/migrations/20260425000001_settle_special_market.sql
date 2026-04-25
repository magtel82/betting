-- ============================================================
-- Migration 0011 — Special market settlement (fas 7C)
-- ============================================================
-- Changes:
--   • Adds 'won' and 'lost' values to special_bet_status enum.
--   • Adds result_text and settled_at columns to special_markets.
--   • Creates settle_special_market RPC (service_role only).
--
-- Settlement model:
--   • Admin calls settle_special_market(market_id, result_text).
--   • All active bets whose selection_text matches result_text
--     (case-insensitive, trimmed) are marked 'won' and credited
--     with potential_payout to special_wallet.
--   • All other active bets are marked 'lost'.
--   • Superseded/cancelled bets are not touched.
--   • Idempotency: if special_markets.settled_at IS NOT NULL the
--     call returns 'already_settled' without any writes.
-- ============================================================

-- ─── Extend enum ──────────────────────────────────────────────────────────────
-- IF NOT EXISTS requires PostgreSQL ≥ 14 (Supabase default).
alter type special_bet_status add value if not exists 'won';
alter type special_bet_status add value if not exists 'lost';

-- ─── Extend special_markets ───────────────────────────────────────────────────
alter table special_markets
  add column if not exists result_text text,
  add column if not exists settled_at  timestamptz;

-- ─── settle_special_market ────────────────────────────────────────────────────
--
-- Parameters:
--   p_market_id   — the market to settle
--   p_result_text — the winning outcome declared by admin:
--                    vm_vinnare / skyttekung : team or player name
--                    sverige_mal             : integer goal count as text
--
-- Matching is lower(trim(selection_text)) = lower(trim(p_result_text)).
--
-- Returns on success:
--   { ok, bets_won, bets_lost, total_paid }
--
-- Returns on error:
--   { error: 'market_not_found' | 'result_text_empty' | 'already_settled' }
--   already_settled also returns settled_at for display.

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
  -- 1. Reject empty result
  if p_result_text is null or trim(p_result_text) = '' then
    return jsonb_build_object('error', 'result_text_empty');
  end if;

  -- 2. Fetch and lock the market for the duration of the transaction
  select * into v_market
  from special_markets
  where id = p_market_id
  for update;

  if not found then
    return jsonb_build_object('error', 'market_not_found');
  end if;

  -- 3. Idempotency gate — if already settled, bail out immediately
  if v_market.settled_at is not null then
    return jsonb_build_object(
      'error',      'already_settled',
      'settled_at', v_market.settled_at
    );
  end if;

  -- 4. Record the result on the market row
  update special_markets
  set result_text = trim(p_result_text),
      settled_at  = now()
  where id = p_market_id;

  -- 5. Settle all active bets for this market
  for v_bet in
    select *
    from special_bets
    where market_id = p_market_id
      and status    = 'active'
    for update
  loop
    if lower(trim(v_bet.selection_text)) = lower(trim(p_result_text)) then

      -- ── Won: credit special_wallet and write ledger entry ─────────────────
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

      -- ── Lost: mark settled, no wallet change ──────────────────────────────
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
