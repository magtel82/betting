\# VM Bet 2026 — Fasplan



\## Fas 1 — Repo, docs och grundarkitektur

Mål:

\- sätt upp Next.js 15 + TypeScript + Tailwind

\- grundläggande appstruktur

\- Supabase-klienter

\- env-struktur

\- PWA-bas

\- svenska grundlayouter

\- skapa `docs/master-spec.md`, `docs/architecture.md`, `docs/phases.md`

\- skapa README

\- bygg inte bettinglogik ännu



Leverabel:

\- projektet startar lokalt

\- docs finns

\- struktur är redo



\---



\## Fas 2 — Databasgrund och auth

Mål:

\- SQL-schema/migrationer för:

&#x20; - profiles

&#x20; - leagues

&#x20; - league\_members

&#x20; - tournaments

&#x20; - teams

&#x20; - matches

&#x20; - auth-relaterade kopplingar

&#x20; - invite whitelist

&#x20; - audit\_log

\- seed-data för aktiv liga, turnering, lag, matcher

\- auth-grund:

&#x20; - Google whitelist

&#x20; - manuella konton via adminmodell

\- RLS-grund



Leverabel:

\- databas kan migreras och seedas

\- loginflöden har en fungerande grund



\---



\## Fas 3 — Admin kärna

Mål:

\- `/admin`

\- skapa manuella konton

\- bjuda in Google-mail

\- soft-deaktivera spelare

\- öppna/stänga liga

\- ändra turneringsstatus

\- audit-logg för dessa flöden



Leverabel:

\- admin kan hantera liga och medlemmar



\---



\## Fas 4 — Matcher, grupper, bracket och datainhämtning

Mål:

\- matcher-tabeller och adapterlager

\- cron-jobb för resultat och odds

\- `/matcher`

\- `/grupper`

\- gruppställning från egen DB

\- automatisk bracket-logik

\- adminfallback för resultat och matchodds



Leverabel:

\- turneringsdata visas korrekt och uppdateras



\---



\## Fas 5 — Matchbetting

Mål:

\- `/bet`

\- placera slip

\- stake-regler

\- oddsvalidering server-side

\- ändra slip

\- ta bort slip

\- låsning vid matchstart

\- visa allas slip

\- `/mina-bet`



Leverabel:

\- spelare kan använda matchbetting fullt ut



\---



\## Fas 6 — Settlement, avgifter och bonus

Mål:

\- settlement av selections/slip

\- void-hantering

\- utbetalningar

\- idempotent omräkning

\- inaktivitetsavgift

\- bonus efter gruppspel

\- ranking + tie-breakers



Leverabel:

\- ekonomin och topplistan fungerar korrekt



\---



\## Fas 7 — Specialbets

Mål:

\- admin sätter specialodds

\- specialbet-marknader och versionering

\- `/specialbet`

\- deadline-logik

\- dold/visad synlighet

\- manuell fastställning av vinnare/skyttekung/Sveriges mål



Leverabel:

\- specialbets fungerar end-to-end



\---



\## Fas 8 — Dashboard, statistik, polish och deploy

Mål:

\- `/`

\- `/stallning`

\- statistik

\- PWA-polish

\- README deploy

\- Vercel-konfig

\- sluttest av kritiska flöden



Leverabel:

\- MVP redo för drift

