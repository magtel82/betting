---
name: Project state
description: Aktuell fas och vad som är byggt i VM Bet 2026
type: project
---

Fas 5B klar (2026-04-22). Nästa = fas 5C (/mina-bet).

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

## Nästa steg

- Fas 5C: /mina-bet (egna slip, status, selections)
- Fas 6: Settlement, inaktivitetsavgift, bonus
