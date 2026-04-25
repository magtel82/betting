-- ============================================================
-- Migration: Add slot descriptions to knockout matches
-- slot_home / slot_away describe the source of each team:
--   "1A"       = winner of group A
--   "2B"       = runner-up of group B
--   "3top-N"   = N:th best third-placed team (ranked by pts/gd/gf)
--   "W73"      = winner of match 73
--   "L101"     = loser of match 101 (used for 3rd-place match)
-- ============================================================

alter table matches
  add column slot_home text,
  add column slot_away text;

-- ── Round of 32 ───────────────────────────────────────────────
-- 12 matches pairing group winners/runners-up
update matches set slot_home = '1A',     slot_away = '2B'     where match_number = 73;
update matches set slot_home = '2A',     slot_away = '1B'     where match_number = 74;
update matches set slot_home = '1C',     slot_away = '2D'     where match_number = 75;
update matches set slot_home = '2C',     slot_away = '1D'     where match_number = 76;
update matches set slot_home = '1E',     slot_away = '2F'     where match_number = 77;
update matches set slot_home = '2E',     slot_away = '1F'     where match_number = 78;
update matches set slot_home = '1G',     slot_away = '2H'     where match_number = 79;
update matches set slot_home = '2G',     slot_away = '1H'     where match_number = 80;
update matches set slot_home = '1I',     slot_away = '2J'     where match_number = 81;
update matches set slot_home = '2I',     slot_away = '1J'     where match_number = 82;
update matches set slot_home = '1K',     slot_away = '2L'     where match_number = 83;
update matches set slot_home = '2K',     slot_away = '1L'     where match_number = 84;
-- 4 matches between the 8 best third-placed teams
update matches set slot_home = '3top-1', slot_away = '3top-2' where match_number = 85;
update matches set slot_home = '3top-3', slot_away = '3top-4' where match_number = 86;
update matches set slot_home = '3top-5', slot_away = '3top-6' where match_number = 87;
update matches set slot_home = '3top-7', slot_away = '3top-8' where match_number = 88;

-- ── Round of 16 ───────────────────────────────────────────────
update matches set slot_home = 'W73', slot_away = 'W74' where match_number = 89;
update matches set slot_home = 'W75', slot_away = 'W76' where match_number = 90;
update matches set slot_home = 'W77', slot_away = 'W78' where match_number = 91;
update matches set slot_home = 'W79', slot_away = 'W80' where match_number = 92;
update matches set slot_home = 'W81', slot_away = 'W82' where match_number = 93;
update matches set slot_home = 'W83', slot_away = 'W84' where match_number = 94;
update matches set slot_home = 'W85', slot_away = 'W86' where match_number = 95;
update matches set slot_home = 'W87', slot_away = 'W88' where match_number = 96;

-- ── Kvartsfinaler ─────────────────────────────────────────────
update matches set slot_home = 'W89',  slot_away = 'W90'  where match_number = 97;
update matches set slot_home = 'W91',  slot_away = 'W92'  where match_number = 98;
update matches set slot_home = 'W93',  slot_away = 'W94'  where match_number = 99;
update matches set slot_home = 'W95',  slot_away = 'W96'  where match_number = 100;

-- ── Semifinaler ───────────────────────────────────────────────
update matches set slot_home = 'W97',  slot_away = 'W98'  where match_number = 101;
update matches set slot_home = 'W99',  slot_away = 'W100' where match_number = 102;

-- ── Bronsmatch ────────────────────────────────────────────────
update matches set slot_home = 'L101', slot_away = 'L102' where match_number = 103;

-- ── Final ─────────────────────────────────────────────────────
update matches set slot_home = 'W101', slot_away = 'W102' where match_number = 104;
