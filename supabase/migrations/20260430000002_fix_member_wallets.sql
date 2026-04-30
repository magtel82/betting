-- ============================================================
-- Migration 0014 — Fix member wallets to correct starting capital
-- ============================================================
-- Corrects match_wallet → 5000 and special_wallet → 1000 for any
-- member whose total differs from the intended 6 000 coins AND
-- who has no bet transactions yet (i.e. no gameplay has occurred).
--
-- Safe to run repeatedly — members with existing transactions are
-- not touched.
-- ============================================================

update league_members lm
set
  match_wallet   = 5000,
  special_wallet = 1000
where
  -- Only reset if balance is wrong
  (lm.match_wallet != 5000 or lm.special_wallet != 1000)
  -- Only reset if no match-wallet transactions exist (no bets placed/refunded)
  and not exists (
    select 1
    from match_wallet_transactions mwt
    where mwt.league_member_id = lm.id
  )
  -- Only reset if no active/settled special bets exist
  and not exists (
    select 1
    from special_bets sb
    where sb.league_member_id = lm.id
      and sb.status not in ('cancelled')
  );
