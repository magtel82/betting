-- ============================================================
-- Migration 0013 — Explicit GRANT for user-facing betting RPCs
-- ============================================================
-- place_bet_slip, cancel_bet_slip, amend_bet_slip are SECURITY DEFINER
-- functions that must be callable by authenticated users via PostgREST.
-- PostgreSQL grants EXECUTE to PUBLIC by default, but we add explicit
-- grants here to ensure correctness across all Supabase project configs.
-- ============================================================

grant execute on function place_bet_slip(uuid, int, jsonb) to authenticated;
grant execute on function cancel_bet_slip(uuid)            to authenticated;
grant execute on function amend_bet_slip(uuid, int, jsonb) to authenticated;
