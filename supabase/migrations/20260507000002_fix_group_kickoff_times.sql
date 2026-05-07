-- ============================================================
-- Migration — Uppdatera scheduled_at för alla 72 gruppspelsmatcher
-- ============================================================
-- Source of truth: Officiellt FIFA VM 2026 schema (kickoff-facit)
-- Konvertering: CEST (UTC+2) → UTC (−2 timmar)
-- Rör inte: match_number, group_letter, home_team_id, away_team_id
-- ============================================================

update matches as m
set scheduled_at = v.sched
from (values

  -- ── Grupp A (MEX KOR CZE RSA) ──────────────────────────────
  -- #1  MEX vs RSA  — 11 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000001'::uuid, '2026-06-11 19:00:00+00'::timestamptz),
  -- #2  KOR vs CZE  — 12 jun 04:00 CEST → UTC 02:00
  ('d1000000-0000-0000-0000-000000000002'::uuid, '2026-06-12 02:00:00+00'::timestamptz),
  -- #3  CZE vs RSA  — 18 jun 18:00 CEST → UTC 16:00
  ('d1000000-0000-0000-0000-000000000003'::uuid, '2026-06-18 16:00:00+00'::timestamptz),
  -- #4  MEX vs KOR  — 19 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000004'::uuid, '2026-06-19 01:00:00+00'::timestamptz),
  -- #5  RSA vs KOR  — 25 jun 03:00 CEST → UTC 01:00 (simultan)
  ('d1000000-0000-0000-0000-000000000005'::uuid, '2026-06-25 01:00:00+00'::timestamptz),
  -- #6  CZE vs MEX  — 25 jun 03:00 CEST → UTC 01:00 (simultan)
  ('d1000000-0000-0000-0000-000000000006'::uuid, '2026-06-25 01:00:00+00'::timestamptz),

  -- ── Grupp B (CAN BIH QAT SUI) ──────────────────────────────
  -- #7  CAN vs BIH  — 12 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000007'::uuid, '2026-06-12 19:00:00+00'::timestamptz),
  -- #8  QAT vs SUI  — 13 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000008'::uuid, '2026-06-13 19:00:00+00'::timestamptz),
  -- #9  SUI vs BIH  — 18 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000009'::uuid, '2026-06-18 19:00:00+00'::timestamptz),
  -- #10 CAN vs QAT  — 19 jun 00:00 CEST → 18 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000010'::uuid, '2026-06-18 22:00:00+00'::timestamptz),
  -- #11 SUI vs CAN  — 24 jun 21:00 CEST → UTC 19:00 (simultan)
  ('d1000000-0000-0000-0000-000000000011'::uuid, '2026-06-24 19:00:00+00'::timestamptz),
  -- #12 BIH vs QAT  — 24 jun 21:00 CEST → UTC 19:00 (simultan)
  ('d1000000-0000-0000-0000-000000000012'::uuid, '2026-06-24 19:00:00+00'::timestamptz),

  -- ── Grupp C (BRA HAI MAR SCO) ──────────────────────────────
  -- #13 BRA vs MAR  — 14 jun 00:00 CEST → 13 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000013'::uuid, '2026-06-13 22:00:00+00'::timestamptz),
  -- #14 HAI vs SCO  — 14 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000014'::uuid, '2026-06-14 01:00:00+00'::timestamptz),
  -- #15 SCO vs MAR  — 20 jun 00:00 CEST → 19 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000015'::uuid, '2026-06-19 22:00:00+00'::timestamptz),
  -- #16 BRA vs HAI  — 20 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000016'::uuid, '2026-06-20 01:00:00+00'::timestamptz),
  -- #17 MAR vs HAI  — 25 jun 00:00 CEST → 24 jun UTC 22:00 (simultan)
  ('d1000000-0000-0000-0000-000000000017'::uuid, '2026-06-24 22:00:00+00'::timestamptz),
  -- #18 SCO vs BRA  — 25 jun 00:00 CEST → 24 jun UTC 22:00 (simultan)
  ('d1000000-0000-0000-0000-000000000018'::uuid, '2026-06-24 22:00:00+00'::timestamptz),

  -- ── Grupp D (USA PAR AUS TUR) ──────────────────────────────
  -- #19 USA vs PAR  — 13 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000019'::uuid, '2026-06-13 01:00:00+00'::timestamptz),
  -- #20 AUS vs TUR  — 14 jun 06:00 CEST → UTC 04:00
  ('d1000000-0000-0000-0000-000000000020'::uuid, '2026-06-14 04:00:00+00'::timestamptz),
  -- #21 USA vs AUS  — 19 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000021'::uuid, '2026-06-19 19:00:00+00'::timestamptz),
  -- #22 TUR vs PAR  — 20 jun 06:00 CEST → UTC 04:00
  ('d1000000-0000-0000-0000-000000000022'::uuid, '2026-06-20 04:00:00+00'::timestamptz),
  -- #23 TUR vs USA  — 26 jun 04:00 CEST → UTC 02:00 (simultan)
  ('d1000000-0000-0000-0000-000000000023'::uuid, '2026-06-26 02:00:00+00'::timestamptz),
  -- #24 PAR vs AUS  — 26 jun 04:00 CEST → UTC 02:00 (simultan)
  ('d1000000-0000-0000-0000-000000000024'::uuid, '2026-06-26 02:00:00+00'::timestamptz),

  -- ── Grupp E (GER CUW CIV ECU) ──────────────────────────────
  -- #25 GER vs CUW  — 14 jun 19:00 CEST → UTC 17:00
  ('d1000000-0000-0000-0000-000000000025'::uuid, '2026-06-14 17:00:00+00'::timestamptz),
  -- #26 CIV vs ECU  — 15 jun 01:00 CEST → 14 jun UTC 23:00
  ('d1000000-0000-0000-0000-000000000026'::uuid, '2026-06-14 23:00:00+00'::timestamptz),
  -- #27 GER vs CIV  — 20 jun 22:00 CEST → UTC 20:00
  ('d1000000-0000-0000-0000-000000000027'::uuid, '2026-06-20 20:00:00+00'::timestamptz),
  -- #28 ECU vs CUW  — 21 jun 02:00 CEST → UTC 00:00
  ('d1000000-0000-0000-0000-000000000028'::uuid, '2026-06-21 00:00:00+00'::timestamptz),
  -- #29 CUW vs CIV  — 25 jun 22:00 CEST → UTC 20:00 (simultan)
  ('d1000000-0000-0000-0000-000000000029'::uuid, '2026-06-25 20:00:00+00'::timestamptz),
  -- #30 ECU vs GER  — 25 jun 22:00 CEST → UTC 20:00 (simultan)
  ('d1000000-0000-0000-0000-000000000030'::uuid, '2026-06-25 20:00:00+00'::timestamptz),

  -- ── Grupp F (NED JPN SWE TUN) ──────────────────────────────
  -- #31 NED vs JPN  — 14 jun 22:00 CEST → UTC 20:00
  ('d1000000-0000-0000-0000-000000000031'::uuid, '2026-06-14 20:00:00+00'::timestamptz),
  -- #32 SWE vs TUN  — 15 jun 04:00 CEST → UTC 02:00
  ('d1000000-0000-0000-0000-000000000032'::uuid, '2026-06-15 02:00:00+00'::timestamptz),
  -- #33 NED vs SWE  — 20 jun 19:00 CEST → UTC 17:00
  ('d1000000-0000-0000-0000-000000000033'::uuid, '2026-06-20 17:00:00+00'::timestamptz),
  -- #34 TUN vs JPN  — 21 jun 06:00 CEST → UTC 04:00
  ('d1000000-0000-0000-0000-000000000034'::uuid, '2026-06-21 04:00:00+00'::timestamptz),
  -- #35 TUN vs NED  — 26 jun 01:00 CEST → 25 jun UTC 23:00 (simultan)
  ('d1000000-0000-0000-0000-000000000035'::uuid, '2026-06-25 23:00:00+00'::timestamptz),
  -- #36 JPN vs SWE  — 26 jun 01:00 CEST → 25 jun UTC 23:00 (simultan)
  ('d1000000-0000-0000-0000-000000000036'::uuid, '2026-06-25 23:00:00+00'::timestamptz),

  -- ── Grupp G (BEL EGY IRN NZL) ──────────────────────────────
  -- #37 BEL vs EGY  — 15 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000037'::uuid, '2026-06-15 19:00:00+00'::timestamptz),
  -- #38 IRN vs NZL  — 16 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000038'::uuid, '2026-06-16 01:00:00+00'::timestamptz),
  -- #39 BEL vs IRN  — 21 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000039'::uuid, '2026-06-21 19:00:00+00'::timestamptz),
  -- #40 NZL vs EGY  — 22 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000040'::uuid, '2026-06-22 01:00:00+00'::timestamptz),
  -- #41 NZL vs BEL  — 27 jun 05:00 CEST → UTC 03:00 (simultan)
  ('d1000000-0000-0000-0000-000000000041'::uuid, '2026-06-27 03:00:00+00'::timestamptz),
  -- #42 EGY vs IRN  — 27 jun 05:00 CEST → UTC 03:00 (simultan)
  ('d1000000-0000-0000-0000-000000000042'::uuid, '2026-06-27 03:00:00+00'::timestamptz),

  -- ── Grupp H (ESP CPV KSA URU) ──────────────────────────────
  -- #43 ESP vs CPV  — 15 jun 18:00 CEST → UTC 16:00
  ('d1000000-0000-0000-0000-000000000043'::uuid, '2026-06-15 16:00:00+00'::timestamptz),
  -- #44 KSA vs URU  — 16 jun 00:00 CEST → 15 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000044'::uuid, '2026-06-15 22:00:00+00'::timestamptz),
  -- #45 ESP vs KSA  — 21 jun 18:00 CEST → UTC 16:00
  ('d1000000-0000-0000-0000-000000000045'::uuid, '2026-06-21 16:00:00+00'::timestamptz),
  -- #46 URU vs CPV  — 22 jun 00:00 CEST → 21 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000046'::uuid, '2026-06-21 22:00:00+00'::timestamptz),
  -- #47 CPV vs KSA  — 27 jun 02:00 CEST → UTC 00:00 (simultan)
  ('d1000000-0000-0000-0000-000000000047'::uuid, '2026-06-27 00:00:00+00'::timestamptz),
  -- #48 URU vs ESP  — 27 jun 02:00 CEST → UTC 00:00 (simultan)
  ('d1000000-0000-0000-0000-000000000048'::uuid, '2026-06-27 00:00:00+00'::timestamptz),

  -- ── Grupp I (FRA SEN IRQ NOR) ──────────────────────────────
  -- #49 FRA vs SEN  — 16 jun 21:00 CEST → UTC 19:00
  ('d1000000-0000-0000-0000-000000000049'::uuid, '2026-06-16 19:00:00+00'::timestamptz),
  -- #50 IRQ vs NOR  — 17 jun 00:00 CEST → 16 jun UTC 22:00
  ('d1000000-0000-0000-0000-000000000050'::uuid, '2026-06-16 22:00:00+00'::timestamptz),
  -- #51 FRA vs IRQ  — 22 jun 23:00 CEST → UTC 21:00
  ('d1000000-0000-0000-0000-000000000051'::uuid, '2026-06-22 21:00:00+00'::timestamptz),
  -- #52 NOR vs SEN  — 23 jun 02:00 CEST → UTC 00:00
  ('d1000000-0000-0000-0000-000000000052'::uuid, '2026-06-23 00:00:00+00'::timestamptz),
  -- #53 NOR vs FRA  — 26 jun 21:00 CEST → UTC 19:00 (simultan)
  ('d1000000-0000-0000-0000-000000000053'::uuid, '2026-06-26 19:00:00+00'::timestamptz),
  -- #54 SEN vs IRQ  — 26 jun 21:00 CEST → UTC 19:00 (simultan)
  ('d1000000-0000-0000-0000-000000000054'::uuid, '2026-06-26 19:00:00+00'::timestamptz),

  -- ── Grupp J (ARG ALG AUT JOR) ──────────────────────────────
  -- #55 ARG vs ALG  — 17 jun 03:00 CEST → UTC 01:00
  ('d1000000-0000-0000-0000-000000000055'::uuid, '2026-06-17 01:00:00+00'::timestamptz),
  -- #56 AUT vs JOR  — 17 jun 06:00 CEST → UTC 04:00
  ('d1000000-0000-0000-0000-000000000056'::uuid, '2026-06-17 04:00:00+00'::timestamptz),
  -- #57 ARG vs AUT  — 22 jun 19:00 CEST → UTC 17:00
  ('d1000000-0000-0000-0000-000000000057'::uuid, '2026-06-22 17:00:00+00'::timestamptz),
  -- #58 JOR vs ALG  — 23 jun 05:00 CEST → UTC 03:00
  ('d1000000-0000-0000-0000-000000000058'::uuid, '2026-06-23 03:00:00+00'::timestamptz),
  -- #59 ALG vs AUT  — 28 jun 04:00 CEST → UTC 02:00 (simultan)
  ('d1000000-0000-0000-0000-000000000059'::uuid, '2026-06-28 02:00:00+00'::timestamptz),
  -- #60 JOR vs ARG  — 28 jun 04:00 CEST → UTC 02:00 (simultan)
  ('d1000000-0000-0000-0000-000000000060'::uuid, '2026-06-28 02:00:00+00'::timestamptz),

  -- ── Grupp K (POR COD UZB COL) ──────────────────────────────
  -- #61 POR vs COD  — 17 jun 19:00 CEST → UTC 17:00
  ('d1000000-0000-0000-0000-000000000061'::uuid, '2026-06-17 17:00:00+00'::timestamptz),
  -- #62 UZB vs COL  — 18 jun 04:00 CEST → UTC 02:00
  ('d1000000-0000-0000-0000-000000000062'::uuid, '2026-06-18 02:00:00+00'::timestamptz),
  -- #63 POR vs UZB  — 23 jun 19:00 CEST → UTC 17:00
  ('d1000000-0000-0000-0000-000000000063'::uuid, '2026-06-23 17:00:00+00'::timestamptz),
  -- #64 COL vs COD  — 24 jun 04:00 CEST → UTC 02:00
  ('d1000000-0000-0000-0000-000000000064'::uuid, '2026-06-24 02:00:00+00'::timestamptz),
  -- #65 COD vs UZB  — 28 jun 01:30 CEST → 27 jun UTC 23:30 (simultan)
  ('d1000000-0000-0000-0000-000000000065'::uuid, '2026-06-27 23:30:00+00'::timestamptz),
  -- #66 COL vs POR  — 28 jun 01:30 CEST → 27 jun UTC 23:30 (simultan)
  ('d1000000-0000-0000-0000-000000000066'::uuid, '2026-06-27 23:30:00+00'::timestamptz),

  -- ── Grupp L (ENG CRO GHA PAN) ──────────────────────────────
  -- #67 ENG vs CRO  — 17 jun 22:00 CEST → UTC 20:00
  ('d1000000-0000-0000-0000-000000000067'::uuid, '2026-06-17 20:00:00+00'::timestamptz),
  -- #68 GHA vs PAN  — 18 jun 01:00 CEST → 17 jun UTC 23:00
  ('d1000000-0000-0000-0000-000000000068'::uuid, '2026-06-17 23:00:00+00'::timestamptz),
  -- #69 ENG vs GHA  — 23 jun 22:00 CEST → UTC 20:00
  ('d1000000-0000-0000-0000-000000000069'::uuid, '2026-06-23 20:00:00+00'::timestamptz),
  -- #70 PAN vs CRO  — 24 jun 01:00 CEST → 23 jun UTC 23:00
  ('d1000000-0000-0000-0000-000000000070'::uuid, '2026-06-23 23:00:00+00'::timestamptz),
  -- #71 PAN vs ENG  — 27 jun 23:00 CEST → UTC 21:00 (simultan)
  ('d1000000-0000-0000-0000-000000000071'::uuid, '2026-06-27 21:00:00+00'::timestamptz),
  -- #72 CRO vs GHA  — 27 jun 23:00 CEST → UTC 21:00 (simultan)
  ('d1000000-0000-0000-0000-000000000072'::uuid, '2026-06-27 21:00:00+00'::timestamptz)

) as v(id, sched)
where m.id = v.id
  and m.stage = 'group';
