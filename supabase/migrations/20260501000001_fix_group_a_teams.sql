-- ============================================================
-- Migration — Fix Group A team assignments
-- Group A (correct per FIFA VM 2026 draw):
--   MEX, RSA, KOR, CZE (Czech Republic replaces Albania)
-- Cascading changes to groups C, G, L to preserve 4 teams each.
-- ============================================================

-- ALB (Albania) → Tjeckien (CZE) — stays in Group A
update teams
set name = 'Tjeckien', short_name = 'CZE', flag_emoji = '🇨🇿'
where id = 'c1000000-0000-0000-0000-000000000003';

-- Teams moving INTO Group A (from C, G, L)
update teams set group_letter = 'A' where id = 'c1000000-0000-0000-0000-000000000009'; -- MEX: C → A
update teams set group_letter = 'A' where id = 'c1000000-0000-0000-0000-000000000027'; -- KOR: G → A
update teams set group_letter = 'A' where id = 'c1000000-0000-0000-0000-000000000048'; -- RSA: L → A

-- Old Group A teams redistributed to fill the vacated spots
update teams set group_letter = 'C' where id = 'c1000000-0000-0000-0000-000000000001'; -- USA: A → C (fills MEX's old spot)
update teams set group_letter = 'G' where id = 'c1000000-0000-0000-0000-000000000004'; -- UKR: A → G (fills KOR's old spot)
update teams set group_letter = 'L' where id = 'c1000000-0000-0000-0000-000000000002'; -- PAN: A → L (fills RSA's old spot)
