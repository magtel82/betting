-- ============================================================
-- Migration — Rebuild all 72 group stage matches
-- ============================================================
-- Source of truth: Excel file "VM-tipset 2026 Magnus.xlsx"
-- (admin's official schedule sheet, extracted 2026-05-04)
--
-- Match pairs and dates are taken verbatim from the Excel file.
-- Kickoff times are NOT specified in the Excel — all matches
-- use placeholder 12:00:00+00. The odds sync will overwrite
-- scheduled_at with the exact kickoff time from the API when
-- a match is successfully resolved.
--
-- Correct groups (verified against both Excel and DB):
--   A: CZE  KOR  MEX  RSA
--   B: BIH  CAN  QAT  SUI
--   C: BRA  HAI  MAR  SCO
--   D: AUS  PAR  TUR  USA
--   E: CIV  CUW  ECU  GER
--   F: JPN  NED  SWE  TUN
--   G: BEL  EGY  IRN  NZL
--   H: CPV  ESP  KSA  URU
--   I: FRA  IRQ  NOR  SEN
--   J: ALG  ARG  AUT  JOR
--   K: COD  COL  POR  UZB
--   L: CRO  ENG  GHA  PAN
--
-- Team IDs are resolved dynamically via short_name JOIN —
-- no hardcoded UUIDs. If a short_name is absent from teams
-- the INSERT will fail with a clear error rather than silently
-- inserting null foreign keys.
-- ============================================================

-- ─── 1. Remove bet_slips referencing group matches ────────────
-- bet_slip_selections.match_id has ON DELETE RESTRICT so the
-- parent bet_slips must be removed first; their selections are
-- removed by the ON DELETE CASCADE on bet_slip_selections.slip_id.
delete from bet_slips
where id in (
  select distinct bs.id
  from bet_slips bs
  join bet_slip_selections bss on bss.slip_id = bs.id
  join matches m               on m.id         = bss.match_id
  where m.stage = 'group'
);

-- ─── 2. Delete group stage matches ───────────────────────────
-- match_odds rows cascade automatically (ON DELETE CASCADE).
delete from matches where stage = 'group';

-- ─── 3. Re-insert 72 group matches from Excel schedule ────────
insert into matches
  (id, tournament_id, match_number, stage, group_letter,
   home_team_id, away_team_id, scheduled_at)
select
  v.match_id::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  v.match_number::int,
  'group'::match_stage,
  v.grp::char(1),
  ht.id,
  at.id,
  v.sched::timestamptz
from (values

  -- ── Grupp A ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000001', 1,'A','MEX','RSA','2026-06-11 12:00:00+00'),  -- Mexiko vs Sydafrika
  ('d1000000-0000-0000-0000-000000000002', 2,'A','KOR','CZE','2026-06-12 12:00:00+00'),  -- Sydkorea vs Tjeckien
  ('d1000000-0000-0000-0000-000000000003', 3,'A','CZE','RSA','2026-06-18 12:00:00+00'),  -- Tjeckien vs Sydafrika
  ('d1000000-0000-0000-0000-000000000004', 4,'A','MEX','KOR','2026-06-19 12:00:00+00'),  -- Mexiko vs Sydkorea
  ('d1000000-0000-0000-0000-000000000005', 5,'A','RSA','KOR','2026-06-25 12:00:00+00'),  -- Sydafrika vs Sydkorea (simultan)
  ('d1000000-0000-0000-0000-000000000006', 6,'A','CZE','MEX','2026-06-25 12:00:00+00'),  -- Tjeckien vs Mexiko (simultan)

  -- ── Grupp B ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000007', 7,'B','CAN','BIH','2026-06-12 12:00:00+00'),  -- Kanada vs Bosnien & Hercegovina
  ('d1000000-0000-0000-0000-000000000008', 8,'B','QAT','SUI','2026-06-13 12:00:00+00'),  -- Qatar vs Schweiz
  ('d1000000-0000-0000-0000-000000000009', 9,'B','SUI','BIH','2026-06-18 12:00:00+00'),  -- Schweiz vs Bosnien & Hercegovina
  ('d1000000-0000-0000-0000-000000000010',10,'B','CAN','QAT','2026-06-19 12:00:00+00'),  -- Kanada vs Qatar
  ('d1000000-0000-0000-0000-000000000011',11,'B','SUI','CAN','2026-06-24 12:00:00+00'),  -- Schweiz vs Kanada (simultan)
  ('d1000000-0000-0000-0000-000000000012',12,'B','BIH','QAT','2026-06-24 12:00:00+00'),  -- Bosnien & Hercegovina vs Qatar (simultan)

  -- ── Grupp C ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000013',13,'C','BRA','MAR','2026-06-14 12:00:00+00'),  -- Brasilien vs Marocko
  ('d1000000-0000-0000-0000-000000000014',14,'C','HAI','SCO','2026-06-14 12:00:00+00'),  -- Haiti vs Skottland
  ('d1000000-0000-0000-0000-000000000015',15,'C','SCO','MAR','2026-06-20 12:00:00+00'),  -- Skottland vs Marocko
  ('d1000000-0000-0000-0000-000000000016',16,'C','BRA','HAI','2026-06-20 12:00:00+00'),  -- Brasilien vs Haiti
  ('d1000000-0000-0000-0000-000000000017',17,'C','MAR','HAI','2026-06-25 12:00:00+00'),  -- Marocko vs Haiti (simultan)
  ('d1000000-0000-0000-0000-000000000018',18,'C','SCO','BRA','2026-06-25 12:00:00+00'),  -- Skottland vs Brasilien (simultan)

  -- ── Grupp D ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000019',19,'D','USA','PAR','2026-06-13 12:00:00+00'),  -- USA vs Paraguay
  ('d1000000-0000-0000-0000-000000000020',20,'D','AUS','TUR','2026-06-14 12:00:00+00'),  -- Australien vs Turkiet
  ('d1000000-0000-0000-0000-000000000021',21,'D','USA','AUS','2026-06-19 12:00:00+00'),  -- USA vs Australien
  ('d1000000-0000-0000-0000-000000000022',22,'D','TUR','PAR','2026-06-20 12:00:00+00'),  -- Turkiet vs Paraguay
  ('d1000000-0000-0000-0000-000000000023',23,'D','TUR','USA','2026-06-26 12:00:00+00'),  -- Turkiet vs USA (simultan)
  ('d1000000-0000-0000-0000-000000000024',24,'D','PAR','AUS','2026-06-26 12:00:00+00'),  -- Paraguay vs Australien (simultan)

  -- ── Grupp E ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000025',25,'E','GER','CUW','2026-06-14 12:00:00+00'),  -- Tyskland vs Curaçao
  ('d1000000-0000-0000-0000-000000000026',26,'E','CIV','ECU','2026-06-15 12:00:00+00'),  -- Elfenbenskusten vs Ecuador
  ('d1000000-0000-0000-0000-000000000027',27,'E','GER','CIV','2026-06-20 12:00:00+00'),  -- Tyskland vs Elfenbenskusten
  ('d1000000-0000-0000-0000-000000000028',28,'E','ECU','CUW','2026-06-21 12:00:00+00'),  -- Ecuador vs Curaçao
  ('d1000000-0000-0000-0000-000000000029',29,'E','CUW','CIV','2026-06-25 12:00:00+00'),  -- Curaçao vs Elfenbenskusten (simultan)
  ('d1000000-0000-0000-0000-000000000030',30,'E','ECU','GER','2026-06-25 12:00:00+00'),  -- Ecuador vs Tyskland (simultan)

  -- ── Grupp F ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000031',31,'F','NED','JPN','2026-06-14 12:00:00+00'),  -- Nederländerna vs Japan
  ('d1000000-0000-0000-0000-000000000032',32,'F','SWE','TUN','2026-06-15 12:00:00+00'),  -- Sverige vs Tunisien
  ('d1000000-0000-0000-0000-000000000033',33,'F','NED','SWE','2026-06-20 12:00:00+00'),  -- Nederländerna vs Sverige
  ('d1000000-0000-0000-0000-000000000034',34,'F','TUN','JPN','2026-06-21 12:00:00+00'),  -- Tunisien vs Japan
  ('d1000000-0000-0000-0000-000000000035',35,'F','TUN','NED','2026-06-26 12:00:00+00'),  -- Tunisien vs Nederländerna (simultan)
  ('d1000000-0000-0000-0000-000000000036',36,'F','JPN','SWE','2026-06-26 12:00:00+00'),  -- Japan vs Sverige (simultan)

  -- ── Grupp G ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000037',37,'G','BEL','EGY','2026-06-15 12:00:00+00'),  -- Belgien vs Egypten
  ('d1000000-0000-0000-0000-000000000038',38,'G','IRN','NZL','2026-06-16 12:00:00+00'),  -- Iran vs Nya Zeeland
  ('d1000000-0000-0000-0000-000000000039',39,'G','BEL','IRN','2026-06-21 12:00:00+00'),  -- Belgien vs Iran
  ('d1000000-0000-0000-0000-000000000040',40,'G','NZL','EGY','2026-06-22 12:00:00+00'),  -- Nya Zeeland vs Egypten
  ('d1000000-0000-0000-0000-000000000041',41,'G','NZL','BEL','2026-06-27 12:00:00+00'),  -- Nya Zeeland vs Belgien (simultan)
  ('d1000000-0000-0000-0000-000000000042',42,'G','EGY','IRN','2026-06-27 12:00:00+00'),  -- Egypten vs Iran (simultan)

  -- ── Grupp H ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000043',43,'H','ESP','CPV','2026-06-15 12:00:00+00'),  -- Spanien vs Kap Verde
  ('d1000000-0000-0000-0000-000000000044',44,'H','KSA','URU','2026-06-16 12:00:00+00'),  -- Saudiarabien vs Uruguay
  ('d1000000-0000-0000-0000-000000000045',45,'H','ESP','KSA','2026-06-21 12:00:00+00'),  -- Spanien vs Saudiarabien
  ('d1000000-0000-0000-0000-000000000046',46,'H','URU','CPV','2026-06-22 12:00:00+00'),  -- Uruguay vs Kap Verde
  ('d1000000-0000-0000-0000-000000000047',47,'H','CPV','KSA','2026-06-27 12:00:00+00'),  -- Kap Verde vs Saudiarabien (simultan)
  ('d1000000-0000-0000-0000-000000000048',48,'H','URU','ESP','2026-06-27 12:00:00+00'),  -- Uruguay vs Spanien (simultan)

  -- ── Grupp I ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000049',49,'I','FRA','SEN','2026-06-16 12:00:00+00'),  -- Frankrike vs Senegal
  ('d1000000-0000-0000-0000-000000000050',50,'I','IRQ','NOR','2026-06-17 12:00:00+00'),  -- Irak vs Norge
  ('d1000000-0000-0000-0000-000000000051',51,'I','FRA','IRQ','2026-06-22 12:00:00+00'),  -- Frankrike vs Irak
  ('d1000000-0000-0000-0000-000000000052',52,'I','NOR','SEN','2026-06-23 12:00:00+00'),  -- Norge vs Senegal
  ('d1000000-0000-0000-0000-000000000053',53,'I','NOR','FRA','2026-06-26 12:00:00+00'),  -- Norge vs Frankrike (simultan)
  ('d1000000-0000-0000-0000-000000000054',54,'I','SEN','IRQ','2026-06-26 12:00:00+00'),  -- Senegal vs Irak (simultan)

  -- ── Grupp J ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000055',55,'J','ARG','ALG','2026-06-17 12:00:00+00'),  -- Argentina vs Algeriet
  ('d1000000-0000-0000-0000-000000000056',56,'J','AUT','JOR','2026-06-17 12:00:00+00'),  -- Österrike vs Jordanien
  ('d1000000-0000-0000-0000-000000000057',57,'J','ARG','AUT','2026-06-22 12:00:00+00'),  -- Argentina vs Österrike
  ('d1000000-0000-0000-0000-000000000058',58,'J','JOR','ALG','2026-06-23 12:00:00+00'),  -- Jordanien vs Algeriet
  ('d1000000-0000-0000-0000-000000000059',59,'J','ALG','AUT','2026-06-28 12:00:00+00'),  -- Algeriet vs Österrike (simultan)
  ('d1000000-0000-0000-0000-000000000060',60,'J','JOR','ARG','2026-06-28 12:00:00+00'),  -- Jordanien vs Argentina (simultan)

  -- ── Grupp K ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000061',61,'K','POR','COD','2026-06-17 12:00:00+00'),  -- Portugal vs Kongo-Kinshasa
  ('d1000000-0000-0000-0000-000000000062',62,'K','UZB','COL','2026-06-18 12:00:00+00'),  -- Uzbekistan vs Colombia
  ('d1000000-0000-0000-0000-000000000063',63,'K','POR','UZB','2026-06-23 12:00:00+00'),  -- Portugal vs Uzbekistan
  ('d1000000-0000-0000-0000-000000000064',64,'K','COL','COD','2026-06-24 12:00:00+00'),  -- Colombia vs Kongo-Kinshasa
  ('d1000000-0000-0000-0000-000000000065',65,'K','COD','UZB','2026-06-28 12:00:00+00'),  -- Kongo-Kinshasa vs Uzbekistan (simultan)
  ('d1000000-0000-0000-0000-000000000066',66,'K','COL','POR','2026-06-28 12:00:00+00'),  -- Colombia vs Portugal (simultan)

  -- ── Grupp L ──────────────────────────────────────────────────
  ('d1000000-0000-0000-0000-000000000067',67,'L','ENG','CRO','2026-06-17 12:00:00+00'),  -- England vs Kroatien
  ('d1000000-0000-0000-0000-000000000068',68,'L','GHA','PAN','2026-06-18 12:00:00+00'),  -- Ghana vs Panama
  ('d1000000-0000-0000-0000-000000000069',69,'L','ENG','GHA','2026-06-23 12:00:00+00'),  -- England vs Ghana
  ('d1000000-0000-0000-0000-000000000070',70,'L','PAN','CRO','2026-06-24 12:00:00+00'),  -- Panama vs Kroatien
  ('d1000000-0000-0000-0000-000000000071',71,'L','PAN','ENG','2026-06-27 12:00:00+00'),  -- Panama vs England (simultan)
  ('d1000000-0000-0000-0000-000000000072',72,'L','CRO','GHA','2026-06-27 12:00:00+00')   -- Kroatien vs Ghana (simultan)

) as v(match_id, match_number, grp, home, away, sched)
join teams ht on trim(ht.short_name::text) = v.home
             and ht.tournament_id = 'a1000000-0000-0000-0000-000000000001'::uuid
join teams at on trim(at.short_name::text) = v.away
             and at.tournament_id = 'a1000000-0000-0000-0000-000000000001'::uuid;
