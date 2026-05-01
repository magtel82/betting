-- ============================================================
-- Migration 0013 — Rätta group_letter mot officiellt FIFA VM 2026-schema
-- ============================================================
-- Lagindelningen i seed-datan stämde inte med det officiella lottdraget.
-- Uppdaterar teams.group_letter och sedan matches.group_letter via JOIN.
-- ============================================================

-- ─── 1. Rätta lag ────────────────────────────────────────────

update teams set group_letter = 'A' where short_name in ('MEX','RSA','KOR','CZE');
update teams set group_letter = 'B' where short_name in ('BIH','CAN','QAT','SUI');
update teams set group_letter = 'C' where short_name in ('BRA','HAI','MAR','SCO');
update teams set group_letter = 'D' where short_name in ('AUS','PAR','TUR','USA');
update teams set group_letter = 'E' where short_name in ('CUW','ECU','CIV','GER');
update teams set group_letter = 'F' where short_name in ('JPN','NED','SWE','TUN');
update teams set group_letter = 'G' where short_name in ('BEL','EGY','IRN','NZL');
update teams set group_letter = 'H' where short_name in ('CPV','KSA','ESP','URU');
update teams set group_letter = 'I' where short_name in ('FRA','IRQ','NOR','SEN');
update teams set group_letter = 'J' where short_name in ('ALG','ARG','JOR','AUT');
update teams set group_letter = 'K' where short_name in ('COL','COD','POR','UZB');
update teams set group_letter = 'L' where short_name in ('ENG','GHA','CRO','PAN');

-- ─── 2. Rätta group_letter på gruppspelsmatcher ──────────────
-- Joinar på home_team_id (båda lag i en gruppmatch är alltid i samma grupp).

update matches m
set group_letter = t.group_letter
from teams t
where m.home_team_id = t.id
  and m.stage = 'group';

-- ─── Verifiering (kör manuellt i dashboard efter migrationen) ─
-- SELECT short_name, name, group_letter FROM teams ORDER BY group_letter, name;
-- SELECT group_letter, count(*) FROM matches WHERE stage = 'group' GROUP BY group_letter ORDER BY group_letter;
-- Förväntat: 12 grupper (A–L), 6 matcher per grupp = 72 matcher totalt.
