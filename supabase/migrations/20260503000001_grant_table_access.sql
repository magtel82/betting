-- ============================================================
-- Migration — Explicit table GRANTs for service_role and authenticated
-- ============================================================
-- Root cause: migrations only granted EXECUTE on functions, never
-- GRANT SELECT/INSERT/... on tables. PostgREST requires explicit
-- table grants even for service_role (BYPASSRLS skips RLS checks
-- but does NOT bypass PostgreSQL's GRANT system).
--
-- service_role: full access to all tables (used by cron/admin
--   route handlers — bypasses RLS entirely).
-- authenticated: select/insert/update/delete as needed (RLS
--   policies then further restrict what each user can see/do).
--
-- ALTER DEFAULT PRIVILEGES ensures any future tables created in
-- the public schema also get these grants automatically.
-- ============================================================

-- ─── service_role — full access, bypasses RLS ────────────────
grant usage  on schema public                    to service_role;
grant all    on all tables    in schema public   to service_role;
grant all    on all sequences in schema public   to service_role;

-- ─── authenticated — RLS-filtered access ─────────────────────
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

-- ─── Default privileges for future tables ────────────────────
alter default privileges in schema public
  grant all on tables    to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select on tables to authenticated;
