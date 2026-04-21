\# VM Bet 2026 — Master-spec



\## Koncept

Privat betting-app för ett grabbgäng inför VM 2026. Spelarna tävlar med fiktiva coins. Verkliga pengar och priser hanteras utanför appen.



\- URL: `bet.telehagen.se`

\- Deploy: Vercel

\- DNS: CNAME `bet` → `cname.vercel-dns.com`



\## Tech-stack

\- Next.js 15 (App Router)

\- TypeScript

\- Tailwind CSS

\- Supabase:

&#x20; - Postgres

&#x20; - Auth

&#x20; - RLS

&#x20; - Realtime vid behov

\- Vercel

\- Vercel Cron Jobs

\- PWA med manifest + offline read-only

\- UI-språk: svenska



\---



\## Produktmodell



\### Ligor

\- Datamodellen ska stödja flera ligor.

\- UI i MVP hanterar bara en aktiv liga.

\- Allt spelrelaterat är per liga:

&#x20; - medlemmar

&#x20; - roller

&#x20; - wallets

&#x20; - bets

&#x20; - statistik

&#x20; - topplista

\- Roller är per liga.

\- En användare kan vara admin i en liga och spelare i en annan.



\### Globala resurser

Dessa delas mellan ligor:

\- turneringar

\- lag

\- matcher

\- matchresultat

\- turneringsstruktur



\---



\## Inloggning



\### Google OAuth

\- Via Supabase Auth

\- Endast whitelistade/inbjudna e-postadresser får logga in



\### Manuella konton

\- Skapas av admin via GUI

\- Användaren loggar in med användarnamn + lösenord

\- Under huven är detta riktiga Supabase Auth-användare

\- Ingen länkning mellan manuella konton och Google-konton byggs i MVP



\### Profil

\- Spelaren får ändra sitt visningsnamn själv

\- Manuellt konto får ändra sitt lösenord själv



\---



\## Roller



\### Admin

Kan:

\- bjuda in spelare via e-post för Google-login

\- skapa manuella konton

\- soft-deaktivera spelare

\- öppna/stänga ligan

\- sätta turneringsstatus

\- manuellt justera matchresultat

\- sätta matchodds manuellt som fallback

\- sätta specialodds manuellt

\- trigga omräkning av slip

\- sätta skyttekung manuellt

\- sätta Sveriges mål manuellt

\- kröna vinnaren

\- se alla spelares slip och specialbets alltid

\- se audit-logg



\### Spelare

Kan:

\- lägga, ändra och ta bort matchslip fram till första matchstart i slipet

\- lägga och ändra specialbets fram till deadline

\- se topplista, matchschema, grupper, bracket, statistik

\- se allas matchslip direkt

\- se andras specialbets först efter deadline



\---



\## Wallets och saldo



\### Två wallets

Varje ligamedlem har två separata wallets:



\- `match\_wallet`: startar på 5 000

\- `special\_wallet`: startar på 1 000



\### Total saldo

Topplistan visar:

\- `total\_coins = match\_wallet + special\_wallet`



\### Negativa saldon

\- Negativa saldon tillåts inte

\- Varken betting eller avgifter får dra wallet under 0



\---



\## Matchbetting



\### Grundregler

\- Singlar och kombis

\- 1–5 matcher per slip

\- Max en selection per match i ett slip

\- Samma spelare får ha flera slip på samma match, även med olika utfall



\### Stake-regler

\- Minsta insats: 10

\- Max insats per slip: 30% av aktuellt `match\_wallet`

\- Maxstake avrundas nedåt till heltal



Konsekvens:

\- Spelaren måste ha minst 34 coins i `match\_wallet` för att kunna lägga nytt slip



\### Odds

\- Matchodds hämtas från The Odds API

\- Om odds saknas visas matchen som inte spelbar

\- Admin kan sätta odds manuellt som fallback

\- Odds valideras server-side vid submit

\- Om odds ändrats måste spelaren bekräfta igen



\### Ändra / ta bort

Före första matchstart i slipet får spelaren:

\- ta bort slip → full återbetalning

\- ändra slip → gammalt slip annulleras, insats återbetalas, nytt slip skapas med nya låsta odds



\### Låsning

\- Hela slipet låses när första matchen i slipet startar



\### Synlighet

Alla spelare ser allas matchslip direkt, inklusive:

\- selections

\- stake

\- odds per selection

\- kombiodds

\- potentiell utbetalning

\- status



\### Void-regler

\- Voidad match tas bort ur slipet

\- Slipets odds räknas om

\- Om alla selections voidas återbetalas hela insatsen

\- Slutliga omräknade odds används för:

&#x20; - utbetalning

&#x20; - statistik

&#x20; - tie-breakers



\---



\## Specialbets



\### Typer

Tre specialbets:

1\. VM-vinnare

2\. Bästa målskytt

3\. Sveriges mål i gruppspelet



Sverige antas delta i VM 2026.



\### Wallet och insats

\- Special\_wallet startar på 1 000

\- Minsta insats per specialbet: 100

\- Spelaren får fördela coins stegvis fram till deadline



\### Deadline

\- 11/6 kl 21:00 svensk tid



\### Om allt inte är ifyllt

\- Giltigt placerade specialbets står kvar

\- Oanvänd eller ogiltig del av `special\_wallet` brinner inne

\- Ingen komplettering efter deadline



\### Odds

\#### VM-vinnare + bästa målskytt

\- Admin sätter odds manuellt

\- Admin får ändra oddsen fram till deadline

\- Spelarens odds låses vid placering eller ändring

\- Om oddset ändrats före submit måste spelaren bekräfta igen



\#### Sveriges mål i gruppspelet

\- Fast utbetalning: `4 x stake`



\### Ändringsmodell

\- Spelaren får bygga specialbets stegvis

\- Ändring av specialbet skapar ny version

\- Tidigare version markeras som ersatt/annullerad

\- Ny version får aktuellt odds vid ändring



\### Synlighet

Före deadline:

\- spelaren ser sina egna

\- admin ser allas

\- andra spelare ser inte dem



Efter deadline:

alla spelare ser:

\- val

\- stake

\- låst odds

\- potentiell utbetalning



\### Om match\_wallet är 0

\- Spelaren är låst från matchbetting

\- Men får fortfarande hantera specialbets fram till deadline



\---



\## Inaktivitetsavgift



\### Regel

På varje matchdag under hela turneringen dras `-50` från `match\_wallet` om spelaren inte varit aktiv.



\### Aktiv om minst ett av följande gäller

1\. spelaren har lagt minst ett nytt matchslip den kalenderdagen

2\. spelaren har minst ett öppet matchslip som innehåller en match som spelas den dagen



\### Begränsning

\- Avgiften dras bara från `match\_wallet`

\- `match\_wallet` får inte gå under 0



\---



\## Bonus efter gruppspel



När alla gruppspelsmatcher är avgjorda delas bonus ut på `match\_wallet`:



\- 1:a: +500

\- 2:a: +300

\- 3:a: +200

\- alla andra: +100



Bonussen adderas ovanpå befintligt saldo.



\---



\## Topplista och ranking



\### Huvudranking

Topplistan baseras på:

\- `match\_wallet + special\_wallet`



\### Tie-breakers

Vid lika total coins:

1\. högsta slutliga vinnande slipodds på en enskild vinnande slip

2\. flest vunna slip

3\. fortfarande lika → delad placering



\### Delad placering

\- alla får bonusen för den delade placeringen

\- nästa placering hoppas över



\---



\## Statistik



Statistiken baseras endast på matchbets.



\### Ska finnas

\- Bäst ROI%

\- Längsta vinnarserie

\- Bästa enskilda bet

\- Sämst ROI%

\- Mest coins förlorade totalt

\- Längsta förlorarserie

\- Sämsta bet



\### Definitioner

\- ROI = `(total utbetalning - total insats) / total insats \* 100`

\- Bästa enskilda bet = vinnande slip med högst faktisk utbetalning

\- Sämsta bet = förlorande slip med högst förlorad stake

\- Vinnar-/förlorarserier räknas på avgjorda slip i den ordning de avgörs

\- Voidade slip ignoreras i seriestatistik



\---



\## Matcher, grupper och bracket



\### Matchdata

\- Matchstart i egen `matches`-tabell är sanningskälla

\- Uppdateras primärt från match/resultat-API

\- Kan justeras manuellt av admin



\### Gruppställning

\- Räknas från matchresultat lagrade i egen databas

\- Egen databas är system of record



\### Bracket

\- Slutspelsträd ska byggas från egen databaslogik

\- Seed-data ska innehålla strukturerade kvalslots

\- Kvalificering till slutspel ska ske automatiskt i MVP



\---



\## Admin och audit



\### Ligastängning

När ligan är stängd:

\- inga nya bets

\- inga ändringar

\- inga borttagningar



Men:

\- redan lagda bets avgörs normalt



\### Resultatändringar

\- Admin kan rätta matchresultat

\- Admin kan trigga omräkning av berörda slip



\### Idempotens

\- Settlement och omräkning måste vara idempotent

\- Dubbelutbetalningar får inte kunna ske



\### Audit-logg i MVP

Audit-logg ska omfatta:

\- adminåtgärder

\- systemkritiska jobb/händelser



Inte alla spelaråtgärder.



\---



\## Sidor i MVP



\- `/` — dashboard

\- `/bet` — lägga matchbets

\- `/mina-bet` — egen historik

\- `/stallning` — topplista + statistik

\- `/matcher` — alla matcher

\- `/grupper` — grupper + bracket

\- `/specialbet` — specialbets

\- `/admin` — adminpanel

\- inloggning — Google eller användarnamn/lösenord



\---



\## Externa API:er



\### The Odds API

\- används för matchodds

\- pollas via cron



\### football-data.org

\- används för matcher/resultat/gruppdata om möjligt

\- pollas via cron



\### Viktigt

\- extern API är ingest-källa, inte system of record

\- data sparas i egen databas och därifrån räknas logik



\---



\## Tidszon

\- Svensk tid i UI och regler

\- UTC i lagring och intern logik



\---



\## PWA

\- installbar på hemskärm

\- offline read-only

\- inga offline-bets i MVP



\---



\## Ej i MVP

\- flera ligor i UI

\- spelarprofilsidor

\- notifieringar

\- länkning mellan Google-konto och manuellt konto

\- offline queue för bets

