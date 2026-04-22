# VM Bet 2026 — Arkitektur

## Översikt

Privat betting-app för ett grabbgäng inför VM 2026.
Driftsatt på `bet.telehagen.se` via Vercel + Supabase.

## Tech-stack

| Lager | Val |
|---|---|
| Frontend | Next.js (App Router) |
| Språk | TypeScript |
| Styling | Tailwind CSS |
| Databas | Supabase Postgres |
| Auth | Supabase Auth (Google OAuth + email/password) |
| Säkerhet | Row Level Security (RLS) |
| Realtid | Supabase Realtime (vid behov) |
| Hosting | Vercel |
| Schemalagda jobb | Vercel Cron Jobs |
| PWA | Web App Manifest + offline read-only |

## Mappstruktur

```
src/
  app/
    (auth)/          # Inloggningssidor (utanför nav)
      login/
    (app)/           # Autentiserade sidor med bottomnav
      page.tsx       # / — Dashboard
      bet/           # /bet — Matchbetting
      mina-bet/      # /mina-bet — Eget bethistorik
      stallning/     # /stallning — Topplista + statistik
      matcher/       # /matcher — Matchschema
      grupper/       # /grupper — Grupper + bracket
      specialbet/    # /specialbet — Specialbets
      admin/         # /admin — Adminpanel
  components/
    nav/             # TopBar, BottomNav
    ui/              # Delade UI-komponenter
    layout/          # Layoutkomponenter
  lib/
    supabase/
      client.ts      # Klient för browser components
      server.ts      # Klient för server components
      middleware.ts  # Klient för middleware
  types/
    index.ts         # Delade TypeScript-typer
  middleware.ts      # Auth-guard + session-refresh (proxy.ts)
supabase/
  migrations/        # SQL-migrationer, körs i nummerordning
  seed/              # Seed-data per kategori (01–04)
  README.md          # Instruktioner för migrationer och seed
docs/
  master-spec.md
  phases.md
  architecture.md
public/
  manifest.json
  icons/
```

## Datamodell

### Globala resurser (delas mellan ligor)
- `tournaments` — turneringar
- `teams` — lag med grupp-tillhörighet
- `matches` — matcher + resultat (group/r32/r16/qf/sf/3rd_place/final)

### Per liga
- `leagues` — liga (kopplad till en turnering)
- `league_members` — spelare + roller + wallets
- `audit_log` — admin- och systemhändelser

### Auth
- `profiles` — kopplat till Supabase Auth uid (1-to-1)
- `invite_whitelist` — whitelistade e-postadresser för Google OAuth

### Turneringsdata (tillagda fas 3B)
- `match_odds` — matchodds per match (en rad per match, upsert). Fält: `home_odds`, `draw_odds`, `away_odds` (numeric, >1.0), `source` ('admin'|'api'), `set_by` (uuid → profiles). Unik constraint på `match_id`. RLS: läs = alla autentiserade, skriv = admin.

### Matchbetting (fas 5A)
- `bet_slips` — ett slip per placering; lagrar stake, combined_odds (snapshot), potential_payout, status
- `bet_slip_selections` — ett rad per match i slipet; odds_snapshot lagras och ändras aldrig
- `match_wallet_transactions` — ledger för match_wallet-rörelser; möjliggör idempotent settlement

### Framtida tabeller (fas 7)
- `special_bets` — specialbets (versionsbaserade)

## Auth-modell

### Google OAuth
- Via Supabase Auth (provider: google)
- Whitelist-kontroll sker i `handle_new_user()`-triggern på `auth.users`
- Icke-whitelistade Google-användare skapas med `is_active = false`
- Middleware redirectar inaktiva användare till `/login?error=not_invited`

### Manuella konton
- Skapas av admin via Supabase service role key (`auth.admin.createUser`)
- Loggar in med e-post + lösenord
- Triggern detekterar `provider = 'email'` och sätter `is_active = true`
- `display_name` kan skickas med via `raw_user_meta_data`

### Auth-antaganden (dokumenterade för fas 3)

1. **Whitelist är mjuk:** Supabase skapar alltid auth.users-raden (kan inte blockeras
   i SQL-trigger). Blockering sker via `is_active = false` i `profiles`-tabellen
   som middleware kontrollerar. Auth-raden existerar alltså även för blockerade.

2. **Ingen länkning Google ↔ manuellt:** En person kan ha två separata konton.
   Ingen sammanslagning byggs i MVP.

3. **Admin har inget eget adminlösenord:** Admin-rollen sätts via `league_members.role`.
   Vem som helst kan vara admin i en liga — rollhantering sker per liga.

4. **Service role key på server:** Alla admin-operationer (skapa konton, etc.)
   kräver `SUPABASE_SERVICE_ROLE_KEY` och körs enbart server-side (Route Handlers).
   Nyckeln exponeras aldrig till klienten.

5. **Email confirm avstängd:** Manuella konton skapas aktiva direkt. Inget
   e-postflöde för bekräftelse behövs för admin-skapade konton.

## Wallet-modell

Varje ligamedlem har två separata wallets:
- `match_wallet` — startar 5 000, används för matchbetting
- `special_wallet` — startar 1 000, används för specialbets

Constraints i databasen garanterar att ingen wallet hamnar under 0.

## RLS-modell

| Tabell | Läs | Skriv |
|---|---|---|
| `profiles` | alla autentiserade | enbart ägaren |
| `invite_whitelist` | admin | admin |
| `tournaments` | alla autentiserade | admin |
| `teams` | alla autentiserade | admin |
| `matches` | alla autentiserade | admin |
| `match_odds` | alla autentiserade | admin |
| `leagues` | egna ligamedlemmar | admin |
| `league_members` | egna ligamedlemmar | admin |
| `audit_log` | admin | autentiserade (egna rader) / service role |
| `bet_slips` | alla ligamedlemmar (samma liga) / admin | via RPC `place_bet_slip` / admin |
| `bet_slip_selections` | alla ligamedlemmar (samma liga) / admin | via RPC `place_bet_slip` / admin |
| `match_wallet_transactions` | egna rader / admin | via RPC `place_bet_slip` / admin |

Admin = `league_members.role = 'admin'` i minst en liga.

## Tidszon

- **Lagring och intern logik**: UTC
- **UI och regler**: Svensk tid (Europe/Stockholm)
- **Specialbet-deadline**: 2026-06-11 21:00 CEST = 19:00 UTC

## Externa API:er och adapterlager (fas 4B)

Extern API är ingest-källa — inte system of record. All logik körs mot egen databas.

### Adapterlager

| Fil | Källa | Ansvar |
|---|---|---|
| `src/lib/adapters/odds-api.ts` | The Odds API | Hämtar h2h-odds (decimal, EU-region) för VM 2026 |
| `src/lib/adapters/football-data.ts` | football-data.org | Hämtar matchschema, status och resultat |

Adapterfilerna är rena HTTP-klienter — ingen DB-logik. De kastar `OddsApiError` / `FootballDataError` vid misslyckade anrop.

### Sync-lager

| Fil | Funktion | Skriver till |
|---|---|---|
| `src/lib/sync/odds.ts` | `syncOdds()` | `match_odds` (upsert) |
| `src/lib/sync/results.ts` | `syncResults()` | `matches` (update) |
| `src/lib/sync/team-map.ts` | `resolveTeamShortName()` | — |
| `src/lib/sync/types.ts` | `SyncResult` | — |

Synk-funktionerna returnerar `SyncResult { processed, updated, skipped, errors }` för loggning.

### Route handlers

| Endpoint | GET | POST | Auth |
|---|---|---|---|
| `/api/sync/odds` | Vercel Cron | Manuell test | `Authorization: Bearer CRON_SECRET` |
| `/api/sync/results` | Vercel Cron | Manuell test | `Authorization: Bearer CRON_SECRET` |

Båda metoderna (GET och POST) kör identisk sync-logik. GET används av Vercel Cron, POST för manuell curl-körning.

### Manuell sync från adminpanelen

Admin kan trigga odds-sync och resultat-sync direkt från `/admin` via knappar i "Manuell sync"-sektionen. Varje körning loggas i `audit_log` med action `sync_odds_manual` respektive `sync_results_manual`, inklusive räknare (processed/updated/skipped/errors). Återkoppling visas direkt i panelen.

**Driftmodell för MVP (gratisplan):**
- Manuell sync från adminpanelen är den primära mekanismen för att uppdatera odds och resultat.
- Automatisk cron kör en gång per natt som backup och säkerhetsnät.
- Databasen är system of record — extern API är enbart ingest-källa.

### Cron-konfiguration (fas 4C)

Definieras i `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/sync/odds",    "schedule": "0 2 * * *" },
    { "path": "/api/sync/results", "schedule": "0 3 * * *" }
  ]
}
```

| Job | Schema | Frekvens | Syfte |
|---|---|---|---|
| `odds` | `0 2 * * *` | En gång per natt (02:00 UTC) | Hämtar aktuella h2h-odds från The Odds API |
| `results` | `0 3 * * *` | En gång per natt (03:00 UTC) | Hämtar matchstatus och resultat från football-data.org |

**MVP-driftmodell:** Automatisk cron är låg-frekvent backup — inte primär uppdateringsmekanism. Admin kan och bör köra sync manuellt från adminpanelen vid behov (t.ex. inför en speldag eller efter att en match avgjorts). Databasen är alltid system of record.

**Vercel Hobby-plan:** Tillåter max en cron-körning per dag per endpoint — passas med detta schema. Tätare frekvens kräver Pro-plan men är inte nödvändig för MVP.

**`maxDuration`:** Båda route handlers exporterar `maxDuration = 60` (sekunder). Normala körningar klarar sig på 5–15 s.

### Hur cron-auth fungerar

1. Vercel genererar automatiskt `CRON_SECRET` för projektet och injicerar `Authorization: Bearer <CRON_SECRET>` i varje cron-anrop.
2. Route handlers verifierar headern mot `process.env.CRON_SECRET`.
3. Om `CRON_SECRET` saknas nekas **alla** anrop (401) — detta är avsiktligt.
4. `CRON_SECRET`-värdet finns i Vercel Dashboard → Settings → Environment Variables.

Manuell trigger (t.ex. för felsökning):
```sh
curl -X POST https://bet.telehagen.se/api/sync/odds \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Admin-odds och cron — skyddsbeteende

`syncOdds()` hämtar alla `match_odds`-rader med `source='admin'` innan bearbetning startar och bygger en uppsättning skyddade match-ID:n. Varje match vars odds är satta av admin hoppas **alltid** över — oavsett vad API:et returnerar.

| Befintlig rad | API har data | Vad händer |
|---|---|---|
| Ingen rad | Ja | Ny rad skapas med `source='api'` |
| `source='api'` | Ja | Raden uppdateras |
| `source='admin'` | Ja | Hoppas över — admin-odds bevaras |
| `source='admin'` | Nej | Hoppas över — admin-odds bevaras |

Admin-odds räknas som explict override tills admin ändrar dem manuellt. Befintligt `source`-fält räcker — ingen extra kolumn behövs.

### Matchningsmappning

**The Odds API → intern match:**
- Normalisera `home_team` / `away_team` till intern `short_name` via `TEAM_NAME_TO_SHORT`-tabellen
- Matcha mot intern match: `home_short = X AND away_short = Y AND |scheduled_at - commence_time| < 4h`

**football-data.org → intern match (tvåstegs):**
1. **Snabbväg**: matcha direkt på `matches.external_id = String(fd.id)` (fungerar efter första körning)
2. **Namnväg**: normalisera teamnamn → `short_name`, matcha på namn + 4h-fönster; lagra `external_id` för framtida snabbväg

### Idempotens

- **Odds**: `match_odds` har `UNIQUE(match_id)` + `ON CONFLICT DO UPDATE` → säker att köra hur många gånger som helst
- **Resultat**: jämför `status`, `home_score`, `away_score`, `*_ht` mot befintliga värden; hoppar över om oförändrat

### Admin-fallback och skyddsbeteende

- **Odds**: `source='admin'`-rader hoppas **alltid** över av API-sync — admin-satta odds är ett explicit override och bevaras tills admin ändrar dem manuellt. Saknas odds eller är `source='api'` skapar/uppdaterar sync normalt.
- **Resultat**: matcher med `status='void'` hoppas **alltid** över — void är ett explicit admin-beslut och påverkas inte av API-sync.
- Om API-anrop misslyckas: hela synken avbryts och returnerar `errors[]`. DB-data förblir oförändrat.
- Saknad team-mapping: loggas som `errors[]`, matchen hoppas över; övriga matcher i körningen fortsätter.

### Miljövariabler

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `ODDS_API_KEY` | Ja (för odds-sync) | API-nyckel för the-odds-api.com |
| `FOOTBALL_DATA_API_KEY` | Ja (för resultat-sync) | API-nyckel för football-data.org |
| `FOOTBALL_DATA_COMPETITION_ID` | Nej | Tävlings-ID (default: 2000 = FIFA WC) |
| `CRON_SECRET` | Ja | Skyddar `/api/sync/*`-endpoints |

API-nycklar läggs in i Vercel Dashboard (Environment Variables). Sätt aldrig dessa i klientkod.

## PWA

- `manifest.json` i `/public`
- Offline: read-only (senaste cachade data)
- Inga offline-bets i MVP

## Deploy

- **Vercel** — automatisk deploy från GitHub `main`
- **DNS**: CNAME `bet` → `cname.vercel-dns.com`
- **Miljövariabler**: sätts i Vercel Dashboard

## Bootstrap — första admin

Det finns inget registreringsflöde. Första admin måste bootstrappas manuellt i Supabase efter att migrationer och seed körts.

### Steg 1 — Logga in med Google (eller skapa via Dashboard)

Logga in med din Google-adress på `/login`. Din profil skapas automatiskt av triggern.

**Om din Google-adress inte är i whitelist** kommer profilen skapas med `is_active = false`. Lägg till din adress i whitelist direkt via SQL-editorn innan du loggar in (eller kör steg 2 nedan).

```sql
-- Lägg till din adress i whitelist (gör detta innan Google-login)
INSERT INTO invite_whitelist (email) VALUES ('din@googleadress.se');
```

### Steg 2 — Hitta ditt user id

```sql
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;
```

### Steg 3 — Lägg till dig som admin i ligan

```sql
INSERT INTO league_members (league_id, user_id, role, match_wallet, special_wallet)
VALUES (
  'b1000000-0000-0000-0000-000000000001',  -- från seed
  '<ditt-user-id>',
  'admin',
  5000,
  1000
);
```

### Steg 4 — Klart

Nu kan du logga in och använda `/admin` för att bjuda in fler spelare och skapa manuella konton.

## Access control (fas 3A)

### Middleware (`src/lib/supabase/middleware.ts`)
- Unauthenticated → redirect till `/login`
- Authenticated men `profiles.is_active = false` → redirect till `/login?error=not_invited`
- `/login` och `/auth/` är alltid publika

### Admin-sidor (`src/lib/auth.ts` → `requireAdmin()`)
- Kollar `league_members.role = 'admin'` server-side
- Redirectar till `/` om inte admin
- Används direkt i `admin/page.tsx`

### Server actions (`src/app/(app)/admin/actions.ts`)
- Varje action kallar `getAdminContext()` för dubbelkontroll
- Returnerar `{ error }` istf att kasta exception

## Access control (fas 3B — tillägg)

### `requireActiveUser()` (`src/lib/auth.ts`)
Utöver att kontrollera `profiles.is_active` (global whitelisting) kontrolleras nu även `league_members.is_active`:
- Användare som **har** liga-medlemskap men **alla** är inaktiva → redirect `/login?error=not_invited`
- Användare **utan** något liga-medlemskap (ny Google-användare efter whitelist-login, innan admin lagt till dem) → tillåts passera

Adminåtgärden `toggleMemberActive` sätter `league_members.is_active = false`. Kombination av de två kontrollagerna säkerställer att deaktiverade spelare blockeras från appen.

## Öppna frågor inför fas 4

- Vilka e-postadresser ska whitelistas från start
- Ikondesign för PWA
- Lösenordsbytesflöde för manuella konton (kan lösas via Supabase-inbyggd funktion)

## Gruppställning (fas 4D)

### Beräkning

Gruppställningen räknas i `src/lib/group-standings.ts` (`computeGroupStandings()`). Källan är alltid den egna databasen — extern API är aldrig involverad i beräkningen.

**Vilka matcher räknas:**
- Enbart matcher med `status = 'finished'`
- Matcher med `status = 'void'`, `'scheduled'` eller `'live'` ignoreras

**Poängsystem:**
- Vinst: 3 poäng
- Oavgjort: 1 poäng vardera
- Förlust: 0 poäng

**Sorteringsordning inom grupp:**
1. Poäng (fallande)
2. Målskillnad (fallande)
3. Gjorda mål (fallande)
4. Kortnamn alfabetiskt (MVP-tiebreaker)

> **MVP-förenkling:** Officiellt FIFA-format använder inbördes möten (head-to-head) som primär tiebreaker efter poäng. I MVP används i stället målskillnad → gjorda mål → alfabetisk ordning. Head-to-head tiebreaker kan läggas till i fas 5+ om det behövs.

### Sida: `/grupper`

- Serverkomponent hämtar alla lag (`group_letter IS NOT NULL`) och alla gruppspelsmatcher
- `computeGroupStandings()` körs server-side och returnerar `Record<string, TeamStanding[]>`
- `GroupsView` (klientkomponent) hanterar flik-navigation A–L med en horisontell scrollbar
- `GroupTable` visar ställningen för vald grupp: # | Lag | S | V | O | F | GD | GM | P
- Fotnot visar antal spelade/totala matcher per grupp

## Matchbetting — datamodell och placeringslogik (fas 5A)

### Tabeller

| Tabell | Syfte | Nyckelkolumner |
|---|---|---|
| `bet_slips` | Ett slip per placering | `league_member_id`, `stake`, `combined_odds`, `potential_payout`, `status` |
| `bet_slip_selections` | En match per rad i slipet | `slip_id`, `match_id`, `outcome` ('home'&#124;'draw'&#124;'away'), `odds_snapshot` |
| `match_wallet_transactions` | Ledger för match_wallet | `league_member_id`, `amount` (+/-), `type`, `slip_id` |

**Relationer:**
- `bet_slips.league_member_id → league_members.id`
- `bet_slip_selections.slip_id → bet_slips.id`
- `bet_slip_selections.match_id → matches.id`
- `match_wallet_transactions.slip_id → bet_slips.id` (nullable)

**Constraints:**
- `bet_slips.stake >= 10`
- `bet_slips.combined_odds > 1.0`
- `bet_slip_selections.odds_snapshot > 1.0`
- `unique(slip_id, match_id)` — max en selection per match i ett slip
- `check (outcome in ('home', 'draw', 'away'))`
- `league_members.match_wallet >= 0` — slutlig spärr mot negativt saldo

### Wallet-ledger

`match_wallet_transactions` är en append-only ledger. Den auktoritativa balansen är `league_members.match_wallet` — ledgern ger revision och möjliggör idempotent settlement (fas 6 kan kontrollera om ett slip redan är utbetalt).

**Transaktionstyper:**
- `bet_stake` — insats debiteras vid slip-placering
- `bet_payout` — utbetalning krediteras vid vunnet slip (fas 6)
- `bet_refund` — återbetalning vid annullering/void (fas 6)
- `inactivity_fee` — daglig inaktivitetsavgift (fas 6)
- `group_bonus` — bonus efter gruppspel (fas 6)
- `admin_adjust` — manuell justering av admin (fas 6+)

### `place_bet_slip` — PostgreSQL RPC

Hela slip-placeringen sker atomärt i en enda DB-transaktion via en `SECURITY DEFINER`-funktion.

**Steg i ordning:**
1. `SELECT ... FOR UPDATE` på `league_members`-raden — låser balansen mot samtida race
2. Verifiera att `auth.uid()` äger raden
3. Kontrollera att ligan är öppen (`leagues.is_open = true`)
4. Validera antal selections (1–5)
5. Validera stake: min 10, max `floor(match_wallet × 0.3)`
6. För varje selection:
   - Matchen måste finnas och ha `status = 'scheduled'`
   - `scheduled_at > now()` (matchen får inte ha startat)
   - Odds måste finnas i `match_odds`
   - Inskickade odds (`odds_snapshot`) måste exakt matcha DB-odds — annars returneras `odds_changed`
   - Multiplicera in i `combined_odds`
7. Beräkna `potential_payout = floor(stake × combined_odds)`
8. `UPDATE league_members SET match_wallet = match_wallet - stake`
9. `INSERT INTO bet_slips`
10. `INSERT INTO bet_slip_selections` (odds läses om från DB — submitted-värdet används ej)
11. `INSERT INTO match_wallet_transactions` (amount = -stake, type = 'bet_stake')
12. Returnera `{ ok: true, slip_id, combined_odds, potential_payout }`

**Felkoder från RPC:**
| Kod | Betydelse |
|---|---|
| `unauthorized` | auth.uid() stämmer inte med league_member |
| `member_not_found` | Inaktivt eller okänt ligamedlemskap |
| `league_closed` | `leagues.is_open = false` |
| `invalid_selection_count` | Inte 1–5 selections |
| `stake_too_low` | stake < 10 |
| `stake_exceeds_limit` | stake > 30% av match_wallet |
| `match_not_bettable` | status ≠ 'scheduled' eller scheduled_at ≤ now() |
| `no_odds` | Ingen rad i match_odds för matchen |
| `odds_changed` | Inskickade odds stämmer inte med DB — UI ska visa nya odds |

### TypeScript-lager

| Fil | Roll |
|---|---|
| `src/lib/betting/place-slip.ts` | Kärn-funktion `placeSlip()` — strukturvalidering, session, RPC-anrop, felöversättning |
| `src/app/(app)/bet/actions.ts` | Server Action `placeSlipAction()` — tunn wrapper, redo för /bet-UI |

**Säkerhetsmodell:**
- RPC anropas med user-klienten (`createClient()`) — `auth.uid()` reflekterar den inloggade användaren
- SECURITY DEFINER ger RPC-funktionen eleverade DB-privilegier utan att exponera service role-nyckeln
- Spelaren kan aldrig direkt INSERT/UPDATE i bettingtabellerna via RLS
