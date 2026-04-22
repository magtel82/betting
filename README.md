# VM Bet 2026

Privat betting-app för ett grabbgäng inför VM 2026. Spelarna tävlar med fiktiva coins.

**URL**: [bet.telehagen.se](https://bet.telehagen.se)

## Tech-stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- [Supabase](https://supabase.com) (Auth, Postgres, RLS)
- Vercel

## Kom igång

```bash
npm install
cp .env.example .env.local
# Fyll i .env.local med dina Supabase-nycklar
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000).

## Miljövariabler

| Variabel | Beskrivning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ODDS_API_KEY` | The Odds API (fas 4) |
| `FOOTBALL_DATA_API_KEY` | football-data.org (fas 4) |
| `NEXT_PUBLIC_APP_URL` | Publik URL, t.ex. `https://bet.telehagen.se` |

Se `.env.example` för fullständig lista.

## Databasinställning

Se [`supabase/README.md`](supabase/README.md) för fullständiga instruktioner.

**Snabbstart:**

```bash
# 1. Länka Supabase-projektet
supabase link --project-ref <project-ref>

# 2. Kör migrationer
supabase db push

# 3. Kör seed-data (via Dashboard SQL-editor eller psql)
#    Kör filerna i ordning: supabase/seed/01–04
```

### Auth-konfiguration (Supabase Dashboard)

1. **Google OAuth**: Authentication → Providers → Google → Enable
2. **E-post/lösenord**: Authentication → Providers → Email → Enable, stäng av "Confirm email"
3. Lägg till `https://<din-url>/auth/callback` som Redirect URI

## Projektstruktur

```
supabase/
  migrations/   # SQL-migrationer (körs i ordning)
  seed/         # Seed-data: turnering, lag, matcher
src/
  app/          # Next.js App Router-sidor
  components/   # Delade UI-komponenter
  lib/supabase/ # Supabase-klienter
  types/        # TypeScript-typer
docs/           # Arkitektur, fasplan, spec
```

Se [`docs/architecture.md`](docs/architecture.md) för full arkitekturgenomgång.

## Bootstrap — första admin

Efter att migrationer och seed körts, gör detta i Supabase Dashboard → SQL-editor:

```sql
-- 1. Lägg till din Google-adress i whitelist (innan Google-login)
INSERT INTO invite_whitelist (email) VALUES ('din@googleadress.se');

-- 2. Logga in på /login med Google

-- 3. Hitta ditt user id
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- 4. Lägg till dig som admin i ligan
INSERT INTO league_members (league_id, user_id, role, match_wallet, special_wallet)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  '<ditt-user-id>',
  'admin',
  5000,
  1000
);
```

Nu kan du öppna `/admin` och bjuda in fler spelare därifrån.

## Fasplan

Se [`docs/phases.md`](docs/phases.md).

## Deploy

Applikationen deployas automatiskt till Vercel vid push till `main`.

DNS: CNAME `bet` → `cname.vercel-dns.com`
