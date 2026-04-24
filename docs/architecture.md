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

### Specialbets (fas 7A)
- `special_markets` — en marknad per typ per turnering; adminodds upserteras här
- `special_bets` — versionsbaserade spelarbets; varje ändring skapar ny rad
- `special_wallet_transactions` — ledger för special_wallet-rörelser

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
| `special_markets` | alla autentiserade | admin |
| `special_bets` | egna rader / admin | via RPC (fas 7B) / admin |
| `special_wallet_transactions` | egna rader / admin | via RPC (fas 7B) / admin |

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
| `src/lib/betting/place-slip.ts` | `placeSlip()` — strukturvalidering, session, RPC-anrop, felöversättning |
| `src/lib/betting/cancel-slip.ts` | `cancelSlip()` — anropar `cancel_bet_slip` RPC |
| `src/app/(app)/bet/actions.ts` | `placeSlipAction()`, `amendSlipAction()` — Server Actions |
| `src/app/(app)/mina-bet/actions.ts` | `deleteSlipAction()` — Server Action för Ta bort |

**Säkerhetsmodell:**
- RPCer anropas med user-klienten (`createClient()`) — `auth.uid()` reflekterar den inloggade användaren
- SECURITY DEFINER ger RPC-funktionerna eleverade DB-privilegier utan att exponera service role-nyckeln
- Spelaren kan aldrig direkt INSERT/UPDATE i bettingtabellerna via RLS

## Ändra och ta bort matchslip (fas 5D)

### Regler

Före första matchstart i slipet får spelaren:
- **Ta bort**: slip → `status = 'cancelled'`, stake återbetalas till `match_wallet`
- **Ändra**: gammalt slip annulleras + insats återbetalas + nytt slip skapas med nya selections och aktuella odds

Villkor för att ett slip ska vara ändringsbart:
- `status = 'open'`
- Alla selections avser matcher med `scheduled_at > now()`

### RPCer (migration 0006)

**`cancel_bet_slip(p_slip_id)`**
Atomär annullering:
1. Lås slip + member (FOR UPDATE)
2. Verifiera `auth.uid()` äger slipet
3. Verifiera `status = 'open'`
4. Verifiera att ingen match startat (`scheduled_at > now()` för alla selections)
5. Sätt `status = 'cancelled'`
6. `match_wallet += stake`
7. Lägg in `bet_refund`-transaktion i ledgern

**`amend_bet_slip(p_old_slip_id, p_stake, p_selections)`**
Atomic cancel + ny placering i en enda transaktion. Kritisk egenskap: **all validering av nya selections körs FÖRE alla skrivningar**. Om nya odds har ändrats (`odds_changed`) rullas hela transaktionen tillbaka — gamla slipet förblir intakt och spelaren kan bekräfta de nya oddsen och försöka igen.

Stake-max för det nya slipet beräknas mot `match_wallet + gamla_stake` (effektiv balans efter återbetalning).

### UI-flöde

**Ta bort** (från /mina-bet):
1. Tryck "Ta bort" → inline confirm visas
2. Bekräfta → `deleteSlipAction(slipId)` → `cancel_bet_slip` RPC → sida revalideras

**Ändra** (från /mina-bet → /bet):
1. Tryck "Ändra" → navigerar till `/bet?amend=<slipId>`
2. Servern hämtar gamla slipets selections, mappar till aktuella odds, pre-fyller `BetPage`
3. Gul banner visas: "Du ändrar ett slip. Det gamla annulleras när du skickar det nya."
4. Spelaren modifierar selections och/eller stake → trycker "Ändra slip"
5. `amendSlipAction(oldSlipId, selections, stake)` → `amend_bet_slip` RPC
6. Vid `odds_changed`: gamla slipet är intakt, UI visar nya odds och frågar om bekräftelse
7. Vid success: "Slipet är ändrat!" + länk till /mina-bet

## Settlement — matchslip (fas 6A)

### Datamodell-tillägg

`bet_slips.final_odds numeric(10,4)` — nullable. Null tills slipet är avgjort. Innehåller de void-justerade kombinerade oddsen (produkt av bara de selections som vann). Används för utbetalning, statistik och tie-breakers. Skiljer sig från `combined_odds` (placeringsögonblicksbild) när en eller flera selections void:ades.

### `settle_match(p_match_id uuid)` — PostgreSQL RPC (migration 0007)

Anropas med service_role (EXECUTE revokad från `public`). Körs i tre faser i en enda transaktion.

**Fas 1 — validera match:**
- Matchen måste ha `status = 'finished'` (med scores) eller `status = 'void'`
- Annars returneras ett felkod utan skrivningar

**Fas 2 — avgör selections:**
- Hämtar alla `bet_slip_selections` med `status = 'open'` och tillhörande slip med `status in ('open', 'locked')` för given match
- `status = 'void'` → selection → 'void'
- `outcome = faktiskt_utfall` → selection → 'won'
- övriga → selection → 'lost'

**Fas 3 — avgör slip:**
För varje unikt slip som påverkades i fas 2:
1. Kontrollera om ALLA selections i slipet är beslutade (`status != 'open'`)
   - Om nej → hoppa över (annan match i slipet inte klar än)
2. Lås slip med `FOR UPDATE` och re-kontrollera `status in ('open','locked')` (idempotency guard)
3. Lås member-raden för wallet-mutation
4. Avgör slutstatus:

| Condition | Slip-status | Wallet-åtgärd |
|---|---|---|
| Alla selections 'void' | `void` | +stake (bet_refund) |
| Minst en selection 'lost' | `lost` | ingen utbetalning |
| Alla icke-void 'won' | `won` | +floor(stake × final_odds) (bet_payout) |

`final_odds` = `EXP(SUM(LN(odds_snapshot)))` för alla 'won' selections — standardtrick för SQL-produkt.

**Returnerar:**
```json
{
  "ok": true,
  "match_status": "finished",
  "outcome": "home",
  "selections_settled": 15,
  "slips_won": 3,
  "slips_lost": 8,
  "slips_void": 0,
  "total_payout": 4200
}
```

### Idempotens

- Fas 2 selekterar `bss.status = 'open'` — redan avgjorda selections hoppas över automatiskt
- Fas 3 selekterar `bs.status in ('open', 'locked')` — redan avgjorda slip finns inte i loopen
- FOR UPDATE + status-recheck inuti loopen: om två transactions råkar köra Fas 3 parallellt på samma slip vinner den som får låset; den andra ser `status != 'open'` och hoppar över
- Dubbel utbetalning är omöjlig — ledgern och wallet uppdateras i samma transaktion som status sätts

### Flöde för admin

1. Admin sätter matchresultat via "Matchresultat"-formuläret i adminpanelen
2. Admin väljer matchen i "Settlement"-sektionen → trycker "Avgör slip"
3. `settleMatchAction(matchId)` → `settleMatch(matchId)` → `settle_match` RPC (service_role)
4. Panelen visar: hur många selections avgjordes, slip vann/förlorade/void, total utbetalning
5. Händelsen loggas i `audit_log` (action = `match_settlement`)

### TypeScript-lager

| Fil | Roll |
|---|---|
| `src/lib/betting/settle-match.ts` | `settleMatch(matchId)` — anropar RPC via admin-klient |
| `src/app/(app)/admin/actions.ts` | `settleMatchAction(matchId)` — verifierar admin, anropar settleMatch, audit-logg |
| `src/app/(app)/admin/_components/SettlePanel.tsx` | Admin-UI: välj match, trigga, visa detaljerat resultat |

## Slip-låsning, inaktivitetsavgift och gruppbonus (fas 6B)

### Schema-tillägg

`match_wallet_transactions.fee_date date` — nullable. Sätts vid `inactivity_fee`-transaktioner till den svenska kalenderdatum som avgiften avser. Används som idempotensnyckeln: en member kan bara ha en `inactivity_fee`-transaktion per `fee_date`.

### `lock_started_slips()` — RPC

Enkel UPDATE-sats som sätter `status = 'locked', locked_at = now()` på alla `open` bet_slips där minst en selection avser en match med `scheduled_at <= now()`.

- Naturligt idempotent: `WHERE status = 'open'` — redan låsta slip berörs inte
- Designad för att kunna anropas från `syncResults()` eller cron utan extra logik
- Returnerar `{ ok: true, locked: N }`

### `apply_inactivity_fee(p_league_id, p_fee_date)` — RPC

**Steg:**
1. Kontrollera att `p_fee_date` är en matchdag (minst en icke-void match finns)
2. För varje aktiv ligamedlem (med FOR UPDATE):
   - Idempotenscheck: `fee_date = p_fee_date AND type = 'inactivity_fee'` i ledgern
   - Hoppa över om saldo = 0
   - **Aktivitetscheck 1:** La ett nytt slip p_fee_date (platstid: Europe/Stockholm)?
   - **Aktivitetscheck 2:** Har ett öppet/låst slip med en match den dagen?
   - Om inaktiv: dra `min(50, match_wallet)` (inga negativa saldon)
   - Inserta ledgerpost med `type = 'inactivity_fee', fee_date = p_fee_date`

**Idempotens:** Kombinationen `(league_member_id, type, fee_date)` i ledgern förhindrar dubbelladdning.

**Datumhantering:** `p_fee_date` är en ISO-datumstring (`YYYY-MM-DD`) som representerar en svensk kalenderdatum. Jämförelse mot `scheduled_at` och `placed_at` görs via `(col at time zone 'Europe/Stockholm')::date`.

### `apply_group_bonus(p_league_id)` — RPC

**Steg:**
1. Kontrollera att alla gruppmatcher (`stage = 'group'`) är `finished` eller `void`
2. Idempotenscheck: finns redan en `group_bonus`-transaktion för någon i ligan?
3. Beräkna ranking med PostgreSQL `RANK()`:

```sql
rank() over (
  order by
    (match_wallet + special_wallet) desc,   -- total_coins
    max(final_odds) filter (won slips) desc, -- bästa vinnande slip
    count(won slips) desc                    -- flest vunna slip
)
```

`RANK()` ger 1, 2, 2, 4 för oavgjort — "nästa placering hoppas över" per spec.

4. Bonustabell:
   | Placering | Bonus |
   |---|---|
   | 1 | +500 |
   | 2 | +300 |
   | 3 | +200 |
   | 4+ | +100 |
5. Kreditera `match_wallet` och inserta `group_bonus`-ledgertransaktioner

**Tie-breakers i detalj:**
- `total_coins` = aktuellt `match_wallet + special_wallet` vid tillfället
- `best_win_odds` = max `final_odds` (void-justerade odds) bland vunna slip; 0 om inga vunna
- `won_slips` = antal slip med `status = 'won'`
- Delad placering: RANK() ger samma siffra → alla delar platsen och dess bonus

### TypeScript-lager

| Fil | Roll |
|---|---|
| `src/lib/betting/lock-slips.ts` | `lockStartedSlips()` |
| `src/lib/betting/inactivity-fee.ts` | `applyInactivityFee(leagueId, date)` |
| `src/lib/betting/group-bonus.ts` | `applyGroupBonus(leagueId)` |
| `src/app/(app)/admin/actions.ts` | `lockSlipsAction`, `applyInactivityFeeAction`, `applyGroupBonusAction` |
| `src/app/(app)/admin/_components/EconomyPanel.tsx` | Admin-UI med tre sektioner |

## Specialbets — datamodell och adminodds (fas 7A)

### Tabeller

| Tabell | Syfte | Nyckelkolumner |
|---|---|---|
| `special_markets` | En marknad per typ per turnering. Adminodds upserteras här. | `tournament_id`, `type`, `odds`, `fixed_payout_factor`, `set_by` |
| `special_bets` | Versionsbaserade spelarbets. Varje ändring skapar ny rad. | `league_member_id`, `market_id`, `version`, `selection_text`, `stake`, `odds_snapshot`, `status` |
| `special_wallet_transactions` | Ledger för special_wallet-rörelser | `league_member_id`, `amount`, `type`, `special_bet_id` |

### Marknadstyper

| Typ | Label | Odds-modell |
|---|---|---|
| `vm_vinnare` | VM-vinnare | Admin sätter decimal odds > 1.0 |
| `skyttekung` | Bästa målskytt | Admin sätter decimal odds > 1.0 |
| `sverige_mal` | Sveriges mål i gruppspelet | Fast `fixed_payout_factor = 4.0` — ingen adminodds |

### Versioneringsmodell

Varje ändring av ett specialbet skapar en ny rad i `special_bets`:
1. Gammal rad: `status = 'superseded'`
2. Ny rad: `status = 'active'`, `version = förra + 1`, `odds_snapshot = aktuellt marknadspris`

Partial unique index garanterar exakt ett `active` bet per `(league_member_id, market_id)`.

Historiska versioner (superseded) bevaras för audit — de ändras aldrig.

**Avbokning:** `status = 'cancelled'`, `special_wallet` återbetalas, ledgerpost med `special_refund`.

### Odds-snapshots

- Spelarens `odds_snapshot` låses vid placering: adminodds läses från `special_markets.odds` (eller `fixed_payout_factor` för `sverige_mal`) i samma transaktion.
- Admin kan ändra `special_markets.odds` fritt fram till deadline — det påverkar bara framtida bets, inte befintliga.
- `potential_payout = floor(stake × odds_snapshot)` beräknas och lagras vid placering.

### RLS-modell

| Tabell | Läs | Skriv |
|---|---|---|
| `special_markets` | alla autentiserade | admin |
| `special_bets` | egna rader / admin | via RPC (fas 7B) / admin |
| `special_wallet_transactions` | egna rader / admin | via RPC (fas 7B) / admin |

Synlighet efter deadline (alla ser andras bets) enforças i applikationslagret (fas 7B).

### Adminodds — admin-UI

Admin sätter odds för `vm_vinnare` och `skyttekung` via `SpecialOddsForm` i `/admin`.

**Server action:** `setSpecialOddsAction()` i `src/app/(app)/admin/actions.ts`  
- Validerar typ (bara `vm_vinnare`/`skyttekung` — `sverige_mal` är fast)
- Validerar odds > 1.0
- Upsertar `special_markets`-raden med `onConflict: "tournament_id,type"`
- Loggar till `audit_log` med action `special_odds_set`

**Komponent:** `src/app/(app)/admin/_components/SpecialOddsForm.tsx`
- Visar nuvarande odds och senast ändrat per marknad
- Formulär per marknad med live feedback
- `sverige_mal` visas som informationsrad (ej redigerbar)

### Wallet-ledger för special_wallet

Speglar `match_wallet_transactions` men för `special_wallet`.

**Transaktionstyper:**
- `special_stake` — insats debiteras vid placering
- `special_payout` — utbetalning krediteras vid vinst (fas 7C settlement)
- `special_refund` — återbetalning vid avbokning/ändring
- `admin_adjust` — manuell adminjustering

**Vid ändring (amendment):** Två ledgerposter skapas i samma transaktion:
1. `special_refund` (+old_stake, refererar gamla bet-raden)
2. `special_stake` (-new_stake, refererar nya bet-raden)

### Serverlogik — placement och cancellation (fas 7B.1)

#### `place_special_bet(p_member_id, p_market_id, p_selection_text, p_stake, p_odds_snapshot)` — RPC

SECURITY DEFINER. Körs i en enda DB-transaktion. Steg i ordning:

1. `SELECT ... FOR UPDATE` på `league_members` — låser balansen mot samtida race
2. Verifiera att `auth.uid()` äger member-raden
3. Verifiera att ligan är öppen
4. Kontrollera att `now() < tournaments.special_bets_deadline`
5. Validera `stake >= 100`
6. Hämta `special_markets`-raden
7. **Odds-kontroll (vm_vinnare/skyttekung):** om `market.odds != p_odds_snapshot` → returnera `odds_changed` med `current_odds`; inga skrivningar sker
8. **sverige_mal:** använda `fixed_payout_factor` direkt — ingen odds-check
9. `SELECT ... FOR UPDATE` på eventuell befintlig aktiv bet för `(member, market)` — förhindrar concurrent amendments
10. Beräkna effektivt saldo (wallet + återbetalning om amendment)
11. Kontrollera att effektivt saldo >= stake
12. Om amendment: sätt gammal bet → `superseded`
13. `INSERT` ny bet-rad med `status='active'`, `version = old+1` (eller 1)
14. `UPDATE league_members: special_wallet = effective_balance - stake`
15. `INSERT` ledgerposter: `special_refund` (om amendment) + `special_stake`
16. Returnera `{ ok, special_bet_id, version, odds_snapshot, potential_payout }`

**Felkoder från RPC:**

| Kod | Betydelse |
|---|---|
| `unauthorized` | auth.uid() äger inte member-raden |
| `member_not_found` | Inaktivt eller okänt ligamedlemskap |
| `league_closed` | `leagues.is_open = false` |
| `deadline_passed` | `now() >= special_bets_deadline` |
| `stake_too_low` | stake < 100 |
| `insufficient_balance` | Effektivt saldo < stake |
| `market_not_found` | Marknaden finns inte |
| `no_odds` | `special_markets.odds` är null (admin ej satt ännu) |
| `odds_changed` | Odds ändrats sedan klienten laddade sidan — `current_odds` skickas med |

#### `cancel_special_bet(p_bet_id)` — RPC

SECURITY DEFINER. Steg:
1. `SELECT ... FOR UPDATE` på bet + member
2. Verifiera ägande via `auth.uid()`
3. Verifiera `status = 'active'`
4. Kontrollera deadline
5. Sätt `status = 'cancelled'`
6. `special_wallet += stake`
7. `INSERT special_refund`-ledgerpost

### TypeScript-lager (fas 7A + 7B.1)

| Fil | Roll |
|---|---|
| `src/app/(app)/admin/actions.ts` | `setSpecialOddsAction()` — sätter adminodds för vm_vinnare/skyttekung |
| `src/app/(app)/admin/_components/SpecialOddsForm.tsx` | Admin-UI för specialodds |
| `src/lib/betting/place-special-bet.ts` | `placeSpecialBet()` / `cancelSpecialBet()` — anropar RPCer via user-klient |

### Enums (Postgres + TypeScript)

| Enum | Värden |
|---|---|
| `special_market_type` | `vm_vinnare`, `skyttekung`, `sverige_mal` |
| `special_bet_status` | `active`, `superseded`, `cancelled` |
| `special_wallet_tx_type` | `special_stake`, `special_payout`, `special_refund`, `admin_adjust` |

### Seed-data

`supabase/seed/05_special_markets.sql` initierar tre marknader för VM 2026-turneringen:
- `vm_vinnare` och `skyttekung` med `odds = null` (sätts av admin)
- `sverige_mal` med `fixed_payout_factor = 4.0`

Seed körs via `seed.sql` och är idempotent (`ON CONFLICT DO NOTHING`).

Alla RPCer anropas via service_role (admin verifieras i TypeScript-lagret). EXECUTE revokad från `public`.
