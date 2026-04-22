-- ============================================================
-- Seed 01 — VM 2026 turnering och aktiv liga
-- ============================================================

-- Persistent UUIDs used across all seed files
-- Tournament: a1000000-0000-0000-0000-000000000001
-- League:     b1000000-0000-0000-0000-000000000001

insert into tournaments (id, name, status, special_bets_deadline)
values (
  'a1000000-0000-0000-0000-000000000001',
  'FIFA VM 2026',
  'upcoming',
  '2026-06-11 19:00:00+00'  -- 11/6 kl 21:00 CEST = 19:00 UTC
);

insert into leagues (id, name, tournament_id, is_open)
values (
  'b1000000-0000-0000-0000-000000000001',
  'Grabbgänget VM 2026',
  'a1000000-0000-0000-0000-000000000001',
  true
);
