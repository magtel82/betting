import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";

export default async function ReglerPage() {
  await requireActiveUser();

  return (
    <>
      <TopBar title="Regler" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">

        {/* Intro */}
        <p className="text-sm text-gray-500">
          Nedan hittar du reglerna för VM Bet 2026. Läs igenom så att du vet
          hur spelet fungerar.
        </p>

        {/* 1. Tippningen */}
        <Section title="Så fungerar tippningen">
          <p>
            Du lämnar in dina tips direkt i appen. För varje match väljer du
            utfall — hemmaseger, oavgjort eller bortaseger — och anger hur
            många coins du vill satsa.
          </p>
          <p>
            Ett matchslip måste lämnas in <strong>innan matchen låses</strong>.
            Fram till dess kan du ändra eller dra tillbaka ditt slip. När låsning
            sker kan inga ändringar göras.
          </p>
          <p>
            Vinnande slip betalar ut{" "}
            <span className="font-semibold">insats × odds</span> (avrundat
            nedåt). Förlorande slip drar insatsen från din wallet.
          </p>
        </Section>

        {/* 2. Coins */}
        <Section title="Coins">
          <p>
            Coins är valutan i spelet. Du har två separata wallets:
          </p>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            <li>
              <span className="font-semibold">Match-wallet</span> — används för
              vanliga matchslip. Startsaldo: 5 000 🪙
            </li>
            <li>
              <span className="font-semibold">Special-wallet</span> — används
              enbart för specialbet. Startsaldo: 1 000 🪙
            </li>
          </ul>
          <p className="mt-2">
            Max insats per matchslip är 30&nbsp;% av ditt aktuella
            match-saldo (minst 10 coins). Coins tjänas in genom att vinna
            matchslip, vinna specialbet och via bonusar.
          </p>
          <p>
            När gruppspelet är avslutat delas en{" "}
            <strong>gruppspelsbonus</strong> ut baserad på placeringen i
            ställningen vid det tillfället: 1:a får 500 🪙, 2:a 300 🪙,
            3:a 200 🪙 och övriga 100 🪙 var.
          </p>
        </Section>

        {/* 3. Specialbet */}
        <Section title="Specialbet">
          <p>
            Specialbet är långsiktiga spel på turneringsnivå — till exempel
            vem som vinner VM, skyttekungen eller hur många mål Sverige gör.
          </p>
          <p>
            Specialbet placeras från din special-wallet och låses vid en
            gemensam deadline (vanligtvis innan turneringen börjar). Efter
            deadline kan inga specialbet läggas till, ändras eller tas bort.
          </p>
          <p>
            Vinnande specialbet betalar ut coins till special-wallet och bidrar
            till ditt totala saldo i ställningen.
          </p>
        </Section>

        {/* 4. Deadline och låsning */}
        <Section title="Deadline och låsning">
          <p>
            Olika delar av spelet låses vid olika tidpunkter:
          </p>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            <li>
              <span className="font-semibold">Matchslip</span> — låses
              automatiskt vid matchstart.
            </li>
            <li>
              <span className="font-semibold">Specialbet</span> — låses vid
              turneringens deadline, vanligtvis före gruppspelsstarten.
            </li>
          </ul>
          <p className="mt-2">
            Efter att en del låsts går det inte att lägga till, ändra eller
            ta bort bet i den delen.
          </p>
        </Section>

        {/* 5. Ställning och lika resultat */}
        <Section title="Ställning och lika resultat">
          <p>
            Ställningen rankas efter <strong>totalt antal coins</strong> (match +
            special wallet kombinerat).
          </p>
          <p>
            Vid lika coins används följande tie-breakers i ordning:
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-gray-700">
            <li>Högst odds på ett enskilt vinnande matchslip</li>
            <li>Flest vunna matchslip</li>
          </ol>
          <p className="mt-2">
            Kvarstår lika efter dessa bryts oavgjort resultat av
            administratören.
          </p>
        </Section>

        {/* 6. Oförutsedda händelser */}
        <Section title="Oförutsedda händelser">
          <p>
            Om en match ställs in, skjuts upp eller om turneringsformatet
            ändras kan berörda slip annulleras och insatsen återbetalas.
          </p>
          <p>
            Vid större förändringar i turneringsupplägget förbehåller sig
            administratören rätten att justera regler och bedömningsgrunder
            för att spelet ska förbli rättvist.
          </p>
        </Section>

        {/* 7. Administration */}
        <Section title="Administration" last>
          <p>
            Administratören har sista ordet vid tolkningsfrågor, tekniska
            problem eller situationer som inte täcks av dessa regler. Beslut
            fattas i syfte att hålla spelet rättvist för alla deltagare.
          </p>
        </Section>

      </div>
    </>
  );
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  void last;
  return (
    <section className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </section>
  );
}
