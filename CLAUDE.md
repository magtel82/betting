@AGENTS.md

# VM Bet 2026

Betting-app för fotbolls-VM 2026. Spelare tävlar i en liga med match-wallet och special-wallet.

## Stack

- **Next.js App Router** + TypeScript (Vercel, Hobby plan)
- **Supabase** — PostgreSQL, Auth (email/password), RLS, Edge Functions
- **Tailwind CSS** — custom CSS-variabler i `globals.css`

## Arkitektur

```
src/app/(app)/          ← autentiserade rutter
  bet/                  ← matchslip-flödet
  mina-bet/             ← mina + alla slip i ligan
  specialbet/           ← specialmarknader
  stallning/            ← topplista + statistik
  matcher/              ← matchschema
  grupper/              ← grupptabeller + slutspel
  admin/                ← adminpanel (resultat, odds, settle)

supabase/
  migrations/           ← körs manuellt i Supabase SQL Editor
  full_setup.sql        ← komplett källkod för hela schemat (håll i sync)
```

Server Actions finns i `<route>/actions.ts`. DB-logik ligger i PostgreSQL-funktioner (RPCs).

## Databas — viktiga tabeller

| Tabell | Beskrivning |
|--------|-------------|
| `leagues` | En liga med `is_open` och `tournament_id` |
| `league_members` | Spelare i en liga — `match_wallet`, `special_wallet` |
| `matches` | Matcher — `status` (scheduled/in_progress/finished), `scheduled_at` (UTC) |
| `match_odds` | Odds per match — `home_odds`, `draw_odds`, `away_odds` |
| `bet_slips` | Matchslip — `status` (open/locked/won/lost/void/cancelled) |
| `bet_slip_selections` | Rader i ett slip — `outcome` (home/draw/away), `odds_snapshot` |
| `special_markets` | Specialmarknader — typ `vm_vinnare`, `skyttekung`, `sverige_mal` |
| `special_bets` | Specialbet per spelare per marknad |
| `match_wallet_transactions` | Ledger för alla wallet-rörelser |
| `profiles` | `display_name` + `email` — kopplad till `auth.users` |

## Viktiga RPC-funktioner

- `place_bet_slip(p_selections, p_stake)` — lägger nytt matchslip
- `amend_bet_slip(p_old_slip_id, p_stake, p_selections)` — ändrar öppet slip atomärt
- `cancel_bet_slip(p_slip_id)` — avbokar öppet slip + återbetalar insats
- `settle_slips(p_match_id, p_home_score, p_away_score)` — avgör slip efter match

## Coins-regler

- `match_wallet` — för matchslip. Max insats = `floor(saldo × 0.3)`, min 10 coins
- `special_wallet` — för specialbet, separat pool. Min insats 100 coins
- Alla rörelser loggas i `match_wallet_transactions`

## Migrationer

Hobby-plan = ingen Supabase CLI push. Workflow:
1. Skriv `supabase/migrations/<timestamp>_<namn>.sql`
2. Uppdatera `supabase/full_setup.sql` (dokumentation + ny uppsättning)
3. Kör manuellt i Supabase SQL Editor — verifiera affected rows

## UI-konventioner

- **Språk**: Alla texter på svenska
- **Färger**: `var(--primary)` blå · `var(--win)` grön · `var(--loss)` röd · `var(--coin)` guld
- **Annullerade slip**: sorteras sist, visas via toggle (av som default), reducerad opacitet
- **Tomtillstånd**: tydliga men diskreta — badge/text, inte trasig känsla
- **Lås-states**: kortfattad svensk text förklarar varför något inte går att ändra
- **Displaynamn**: `display_name` i första hand, annars email-prefix (kapitaliserat) som fallback

## Vercel / deployment

- Automatisk deploy vid push till `main`
- Hobby-plan: max 1 cron per route, ingen parallell exekvering
- Cron-routes: `/api/sync-results`, `/api/sync-odds`
