# Supabase — Migrationer och seed

## Förutsättningar

```bash
npm install -g supabase
supabase login
```

Eller använd Supabase Dashboard SQL-editorn direkt.

## Köra migrationer

### Via Supabase CLI (rekommenderas)

```bash
# Länka projektet (engångsgrej)
supabase link --project-ref <din-project-ref>

# Kör alla migrationer
supabase db push
```

### Via Dashboard

Kör varje fil i ordning i SQL-editorn:
1. `migrations/20260421000001_schema.sql`
2. `migrations/20260421000002_functions.sql`
3. `migrations/20260421000003_rls.sql`

## Köra seed-data

### Via psql

```bash
psql "$DATABASE_URL" \
  -f supabase/seed/01_tournament.sql \
  -f supabase/seed/02_teams.sql \
  -f supabase/seed/03_matches_group.sql \
  -f supabase/seed/04_matches_knockout.sql
```

Databas-URL finns i Supabase Dashboard → Settings → Database → Connection string (URI).

### Via Dashboard

Kör filerna i ordning 01 → 04 i SQL-editorn.

## Resetta (lokal dev)

```bash
supabase db reset
# Kör sedan seed manuellt
```

## Auth-konfiguration i Supabase Dashboard

### Google OAuth
1. Authentication → Providers → Google → Enable
2. Fyll i Client ID och Client Secret från Google Cloud Console
3. Lägg till `https://<din-url>/auth/callback` som Redirect URI

### E-post / lösenord (manuella konton)
1. Authentication → Providers → Email → Enable
2. Stäng av "Confirm email" (admin skapar konton direkt)

### Whitelist-enforcement
Whitelist-logiken sker i databasen via `handle_new_user()`-triggern:
- Google OAuth-användare som inte finns i `invite_whitelist` får `is_active = false`
- Middleware redirectar inaktiva användare till `/login?error=not_invited`
- Admin lägger till e-poster i `invite_whitelist` via admin-UI (fas 3)

### Manuella konton
Admin skapar konton via Supabase service role key (fas 3):
```typescript
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: 'spelare@example.com',
  password: 'temporärt-lösenord',
  user_metadata: { display_name: 'Spelarnamn' },
})
```
Triggern sätter `account_type = 'manual'` och `is_active = true`.

## Miljövariabler

Se `.env.example` i projektets rot.

| Variabel | Var den finns |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API → service_role key |

## Seed-data

| Fil | Innehåll |
|---|---|
| `01_tournament.sql` | VM 2026-turnering + aktiv liga |
| `02_teams.sql` | 48 lag med grupper A–L |
| `03_matches_group.sql` | 72 gruppspelsmatcher (juni 11–27) |
| `04_matches_knockout.sql` | 32 slutspelsslots (platshållare) |

> **OBS:** Lag och matchdatum är baserade på bästa tillgängliga information.
> Verifiera och justera mot officiellt FIFA-schema om något behöver korrigeras.
