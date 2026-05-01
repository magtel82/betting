---
name: Project state
description: Aktuell fas och vad som är byggt i VM Bet 2026
type: project
---

Fas 7C klar (2026-04-29). Supabase-projektet fyzdvppcvfaqbzkhvsjr är initierat med alla migrationer och seed-data (full_setup.sql). Appen är redo att köra mot riktig databas.

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
- **Fas 7 (2026-04-30):** Buggfixar — GRANT på betting-RPCer, plånbokskorrektion (5000/1000), SlipPanel-CTA alltid synlig på mobil, sessionStorage för att bevara val vid navigering

## Kända kvarstående punkter

- Grupplottdrag (02_teams.sql): Lagindelningen kan behöva rättas mot officiellt FIFA WC 2026-lottdrag. Strukturen är intern konsistent men okontrollerad mot faktiskt lottdrag (genomfört dec 2025).
- Manuellt SQL-steg krävs för befintliga members som skapades med fel plånbok: köra migration 0014 i Supabase-dashboarden.

## Säkerhets- och bugfixar (2026-05-01)

- BUG-1: potential_payout är nu bigint i bet_slips och special_bets; alla tre placement-RPCer och settle_special_market omskrivna med bigint-variabler
- BUG-2: Ny RLS-policy "special_bets: league members can read after deadline" — spelare ser andras specialbets i samma liga när deadline har passerat
- SEC-1: /api/debug-auth borttagen helt
- SEC-2: auth callback saniterar next-parametern (rejecterar tomma, protocol-relative och externa paths)
- LOGIC-2: amendSlipAction har nu samma strukturella validering som placeSlip (count, duplicate match_id, outcome, odds)

## Nästa steg

- Rätta lag/grupper om FIFA-lottdrag avviker från seed
