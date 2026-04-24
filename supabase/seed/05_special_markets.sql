-- ============================================================
-- Seed 05 — Specialbet-marknader för VM 2026
-- ============================================================
-- Initierar tre marknader för turneringen.
-- vm_vinnare och skyttekung startar med odds=null (admin sätter via adminpanelen).
-- sverige_mal har fast utbetalning 4× insats och kräver aldrig adminodds.

insert into special_markets (tournament_id, type, label, odds, fixed_payout_factor, set_by)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    'vm_vinnare',
    'VM-vinnare',
    null,
    null,
    null
  ),
  (
    'a1000000-0000-0000-0000-000000000001',
    'skyttekung',
    'Bästa målskytt',
    null,
    null,
    null
  ),
  (
    'a1000000-0000-0000-0000-000000000001',
    'sverige_mal',
    'Sveriges mål i gruppspelet',
    null,
    4.0,
    null
  )
on conflict (tournament_id, type) do nothing;
