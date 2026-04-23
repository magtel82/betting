---
name: Project state
description: Aktuell fas och vad som är byggt i VM Bet 2026
type: project
---

Fas 6B klar (2026-04-23). Nästa = dashboard + /stallning eller commit/push.

**Why:** Privat betting-app för ett grabbgäng inför VM 2026. Next.js 16 + Supabase + Vercel.

**How to apply:** Utgå alltid från befintlig kod. Databasen är system of record. Extern API är ingest-källa.

## Vad som är byggt

- **Fas 1–2:** Grundarkitektur, schema, seed (48 lag grupp A-L, matcher, knockout-slots)
- **Fas 3:** Adminpanel — skapa konton, bjuda in, deaktivera, öppna/stänga liga, audit-logg
- **Fas 3B:** match_odds-tabell, admin kan sätta matchodds manuellt, MatchOddsForm + MatchResultForm i admin
- **Fas 4A–C:** Adapterlager (odds-api.ts, football-data.ts), sync-lager (odds.ts, results.ts), cron (en gång/natt), `/api/sync/odds` + `/api/sync/results` med admin-skydd (source='admin' hoppas över)
- **Fas 4C:** SyncPanel i adminpanelen — manuell trigger för odds-sync och resultat-sync med återkoppling
- **Fas 4D:** `/grupper` — gruppställning A-L beräknad från DB, src/lib/group-standings.ts
- **Fas 5A:** Datamodell + serverlogik — bet_slips, bet_slip_selections, match_wallet_transactions, place_bet_slip RPC, placeSlip() + placeSlipAction()
- **Fas 5B:** /bet UI — MatchBetCard (H/X/B-knappar), SlipPanel (sticky drawer), BetPage (state), odds_changed-flöde
- **Fas 5C:** /mina-bet — SlipCard, SlipsView (Mina/Alla-tabs), UX-fix i BetPage, odds-förklaring
- **Fas 5D:** Ändra/ta bort slip — cancel_bet_slip + amend_bet_slip RPC, deleteSlipAction, amendSlipAction, /bet?amend=<id>
- **Fas 6A:** Settlement — settle_match RPC (idempotent, void-hantering, final_odds), SettlePanel i admin
- **Fas 6B:** Slip-låsning, inaktivitetsavgift, gruppbonus — 3 RPCer + EconomyPanel i admin, fee_date i ledger

## Nästa steg

- Dashboard (/) — wallet-saldo, senaste slip-händelser, kommande matcher
- /stallning — topplista (total_coins) + statistik (ROI, serier)
- Specialbets (fas 7)
- Koppla lock_started_slips() till syncResults() för mer automatik
