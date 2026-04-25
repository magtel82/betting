"use client";

import { useActionState, useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { placeSpecialBetAction, cancelSpecialBetAction } from "../actions";
import type { PlaceActionState, CancelActionState } from "../actions";
import type { SpecialMarket, SpecialBet, SpecialMarketType, SpecialBetStatus } from "@/types";

// ─── OtherBetEntry ────────────────────────────────────────────────────────────
// Shape passed from the server after deadline reveal.

export interface OtherBetEntry {
  playerName:      string;
  marketId:        string;
  marketType:      SpecialMarketType;
  marketLabel:     string;
  selectionText:   string;
  stake:           number;
  oddsSnapshot:    number;
  potentialPayout: number;
  status:          SpecialBetStatus;
  isFixed:         boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCoins(n: number) {
  return n.toLocaleString("sv-SE") + " coins";
}

function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day:      "numeric",
    month:    "short",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false;
  return Date.now() >= new Date(deadline).getTime();
}

// ─── Wallet summary ───────────────────────────────────────────────────────────

function WalletSummary({
  specialWallet,
  activeBets,
}: {
  specialWallet: number;
  activeBets:    SpecialBet[];
}) {
  const placed = activeBets.reduce((s, b) => s + b.stake, 0);
  const total  = specialWallet + placed;
  const pct    = total > 0 ? Math.round((placed / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Special-wallet</p>
        <p className="text-sm font-semibold text-gray-900">{fmtCoins(total)}</p>
      </div>

      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>
          <span className="font-medium text-gray-700">{fmtCoins(placed)}</span> placerade
        </span>
        <span>
          <span className="font-medium text-gray-700">{fmtCoins(specialWallet)}</span> kvar
        </span>
      </div>
    </div>
  );
}

// ─── Deadline banner ──────────────────────────────────────────────────────────

function DeadlineBanner({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;

  const passed = isDeadlinePassed(deadline);

  if (passed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">Deadline passerade</p>
        <p className="mt-0.5 text-xs text-red-600">
          {fmtDeadline(deadline)} — inga fler ändringar tillåts.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1">
      <p className="text-sm font-semibold text-amber-800">
        Deadline: {fmtDeadline(deadline)}
      </p>
      <p className="text-xs text-amber-700">
        Coins som inte placerats vid deadline försvinner — de går inte att ta med till
        vanliga bet.
      </p>
    </div>
  );
}

// ─── OddsChangedBanner ────────────────────────────────────────────────────────

function OddsChangedBanner({
  newOdds,
  onConfirm,
}: {
  newOdds:   number;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
      <p className="text-sm font-semibold text-amber-800">Oddsen har ändrats</p>
      <p className="text-xs text-amber-700">
        Nya odds: <strong>{newOdds.toFixed(2)}</strong>. Bekräfta för att spela med de
        uppdaterade oddsen.
      </p>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Bekräfta nya odds och försök igen
      </button>
    </div>
  );
}

// ─── Submit button ────────────────────────────────────────────────────────────

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {pending ? "Sparar…" : label}
    </button>
  );
}

// ─── CancelForm ───────────────────────────────────────────────────────────────

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-gray-400 underline hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "Avbokar…" : "Avboka bet"}
    </button>
  );
}

function CancelForm({ betId }: { betId: string }) {
  const [state, action] = useActionState<CancelActionState, FormData>(
    cancelSpecialBetAction,
    null,
  );

  return (
    <form action={action}>
      <input type="hidden" name="bet_id" value={betId} />
      {state?.ok === false && (
        <p className="mb-1 text-xs text-red-600">{state.error}</p>
      )}
      <CancelButton />
    </form>
  );
}

// ─── CurrentBet ───────────────────────────────────────────────────────────────

function CurrentBet({
  bet,
  market,
  isLocked,
}: {
  bet:      SpecialBet;
  market:   SpecialMarket;
  isLocked: boolean;
}) {
  const isFixed = market.type === "sverige_mal";

  return (
    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Ditt aktiva bet</p>
        {!isLocked && <CancelForm betId={bet.id} />}
      </div>
      <p className="text-sm font-medium text-gray-900">{bet.selection_text}</p>
      <div className="flex gap-4 text-xs text-gray-600">
        <span>Insats: <strong>{fmtCoins(bet.stake)}</strong></span>
        {isFixed ? (
          <span>Möjlig vinst: <strong>{fmtCoins(bet.potential_payout)}</strong> (4×)</span>
        ) : (
          <span>
            Odds: <strong>{Number(bet.odds_snapshot).toFixed(2)}</strong> · Möjlig vinst:{" "}
            <strong>{fmtCoins(bet.potential_payout)}</strong>
          </span>
        )}
      </div>
      {!isLocked && (
        <p className="text-[11px] text-blue-600">Du kan ändra ditt bet tills deadline.</p>
      )}
    </div>
  );
}

// ─── MarketCard ───────────────────────────────────────────────────────────────

function MarketCard({
  market,
  activeBet,
  isLocked,
  specialWallet,
}: {
  market:        SpecialMarket;
  activeBet:     SpecialBet | null;
  isLocked:      boolean;
  specialWallet: number;
}) {
  const isFixed  = market.type === "sverige_mal";
  const baseOdds = isFixed
    ? (market.fixed_payout_factor ?? 4.0)
    : (market.odds ?? null);

  const [oddsToUse, setOddsToUse] = useState<number | null>(baseOdds);
  const [state, action] = useActionState<PlaceActionState, FormData>(
    placeSpecialBetAction,
    null,
  );

  useEffect(() => {
    setOddsToUse(baseOdds);
  }, [baseOdds]);

  const oddsChangedState =
    state?.ok === false && state.code === "odds_changed" ? state : null;

  function handleConfirmNewOdds() {
    if (oddsChangedState?.currentOdds != null) {
      setOddsToUse(oddsChangedState.currentOdds);
    }
  }

  const [stakeInput, setStakeInput] = useState("");
  const stakeNum        = parseInt(stakeInput, 10);
  const validStake      = !isNaN(stakeNum) && stakeNum >= 100;
  const preview         = validStake && oddsToUse != null ? Math.floor(stakeNum * oddsToUse) : null;
  const effectiveWallet = specialWallet + (activeBet?.stake ?? 0);

  const { title, description, inputLabel, inputPlaceholder } = MARKET_META[market.type];

  const hasNoOdds    = !isFixed && baseOdds == null;
  const formDisabled = isLocked || hasNoOdds;

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        {isFixed && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            Fast utbetalning: 4× insats
          </p>
        )}
        {!isFixed && baseOdds != null && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            Odds: {Number(baseOdds).toFixed(2)}
          </p>
        )}
        {hasNoOdds && (
          <p className="mt-1 text-xs text-gray-400">Odds är ännu inte satta av admin.</p>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {activeBet && (
          <CurrentBet bet={activeBet} market={market} isLocked={isLocked} />
        )}

        {!formDisabled && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="market_id"     value={market.id} />
            <input type="hidden" name="odds_snapshot" value={oddsToUse ?? ""} />

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-700">
                {inputLabel}
              </label>
              {market.type === "sverige_mal" ? (
                <input
                  type="number"
                  name="selection_text"
                  min={0}
                  max={40}
                  step={1}
                  placeholder={inputPlaceholder}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              ) : (
                <input
                  type="text"
                  name="selection_text"
                  placeholder={inputPlaceholder}
                  required
                  autoComplete="off"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label className="text-xs font-medium text-gray-700">Insats (coins)</label>
                <span className="text-[11px] text-gray-400">
                  Max {fmtCoins(effectiveWallet)}
                </span>
              </div>
              <input
                type="number"
                name="stake"
                min={100}
                max={effectiveWallet}
                step={100}
                placeholder="t.ex. 500"
                required
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              {preview != null && (
                <p className="text-xs text-gray-500">
                  Möjlig vinst:{" "}
                  <strong className="text-gray-800">{fmtCoins(preview)}</strong>
                  {isFixed && " (4× insats)"}
                </p>
              )}
            </div>

            {oddsChangedState && (
              <OddsChangedBanner
                newOdds={oddsChangedState.currentOdds!}
                onConfirm={handleConfirmNewOdds}
              />
            )}

            {state?.ok === false && state.code !== "odds_changed" && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            )}

            {state?.ok === true && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Bet placerat!
              </p>
            )}

            <SubmitBtn label={activeBet ? "Uppdatera bet" : "Placera bet"} />
          </form>
        )}

        {isLocked && !activeBet && (
          <p className="text-sm text-gray-400">Inget bet placerat.</p>
        )}
      </div>
    </section>
  );
}

// ─── BeforeDeadlineNotice ─────────────────────────────────────────────────────

function BeforeDeadlineNotice() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-center space-y-1">
      <p className="text-sm font-medium text-gray-600">Andras bet syns efter deadline</p>
      <p className="text-xs text-gray-400">
        Alla bets låses och visas samtidigt — ingen kan se andras val i förväg.
      </p>
    </div>
  );
}

// ─── OthersBetRow ─────────────────────────────────────────────────────────────

function OthersBetRow({ entry }: { entry: OtherBetEntry }) {
  const statusBadge =
    entry.status === "won"  ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">Vann</span>  :
    entry.status === "lost" ? <span className="rounded-full bg-red-100   px-2 py-0.5 text-[11px] font-semibold text-red-700">Förlorade</span> :
    null;

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-gray-500 truncate">{entry.playerName}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{entry.selectionText}</p>
        <p className="text-xs text-gray-500">
          {fmtCoins(entry.stake)}
          {entry.isFixed ? (
            <> · <span className="text-gray-400">4× fast</span> · möjlig vinst <strong className="text-gray-700">{fmtCoins(entry.potentialPayout)}</strong></>
          ) : (
            <> · odds <strong className="text-gray-700">{Number(entry.oddsSnapshot).toFixed(2)}</strong> · möjlig vinst <strong className="text-gray-700">{fmtCoins(entry.potentialPayout)}</strong></>
          )}
        </p>
      </div>
      {statusBadge && <div className="shrink-0 pt-0.5">{statusBadge}</div>}
    </div>
  );
}

// ─── OthersRevealSection ──────────────────────────────────────────────────────

function OthersRevealSection({
  othersReveal,
  markets,
  isAdmin,
}: {
  othersReveal: OtherBetEntry[];
  markets:      SpecialMarket[];
  isAdmin:      boolean;
}) {
  const grouped = MARKET_ORDER
    .map((type) => {
      const market = markets.find((m) => m.type === type);
      if (!market) return null;
      const entries = othersReveal.filter((b) => b.marketId === market.id);
      return { type, market, entries };
    })
    .filter(Boolean) as { type: SpecialMarketType; market: SpecialMarket; entries: OtherBetEntry[] }[];

  const totalWithBets = othersReveal.length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {isAdmin ? "Alla spelares bet" : "Andras bet"}
        </h2>
        {totalWithBets === 0 && (
          <span className="text-xs text-gray-400">Inga bet placerade av andra</span>
        )}
      </div>

      {grouped.map(({ type, market, entries }) => (
        <section key={market.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">{MARKET_META[type].title}</p>
          </div>

          <div className="px-4">
            {entries.length === 0 ? (
              <p className="py-4 text-xs text-gray-400">Inga bet placerade på denna marknad.</p>
            ) : (
              entries.map((entry, i) => (
                <OthersBetRow key={`${entry.playerName}-${i}`} entry={entry} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Market metadata ──────────────────────────────────────────────────────────

const MARKET_META: Record<
  SpecialMarketType,
  { title: string; description: string; inputLabel: string; inputPlaceholder: string }
> = {
  vm_vinnare: {
    title:            "VM-vinnare",
    description:      "Vilket lag vinner VM 2026?",
    inputLabel:       "Lag",
    inputPlaceholder: "t.ex. Brasilien",
  },
  skyttekung: {
    title:            "Bästa målskytt",
    description:      "Vem skjuter flest mål i turneringen?",
    inputLabel:       "Spelare",
    inputPlaceholder: "t.ex. Mbappé",
  },
  sverige_mal: {
    title:            "Sveriges mål i gruppspelet",
    description:      "Hur många mål gör Sverige totalt i de tre gruppspelsmatcherna?",
    inputLabel:       "Antal mål",
    inputPlaceholder: "t.ex. 4",
  },
};

// ─── SpecialbetPage ───────────────────────────────────────────────────────────

interface Props {
  specialWallet: number;
  deadline:      string | null;
  deadlinePassed: boolean;
  isAdmin:       boolean;
  markets:       SpecialMarket[];
  activeBets:    SpecialBet[];
  othersReveal:  OtherBetEntry[] | null;
}

const MARKET_ORDER: SpecialMarketType[] = ["vm_vinnare", "skyttekung", "sverige_mal"];

export function SpecialbetPage({
  specialWallet,
  deadline,
  deadlinePassed,
  isAdmin,
  markets,
  activeBets,
  othersReveal,
}: Props) {
  const isLocked = isDeadlinePassed(deadline);

  const marketByType = new Map(markets.map((m) => [m.type, m]));
  const betByMarket  = new Map(activeBets.map((b) => [b.market_id, b]));

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      <DeadlineBanner deadline={deadline} />
      <WalletSummary specialWallet={specialWallet} activeBets={activeBets} />

      {MARKET_ORDER.map((type) => {
        const market = marketByType.get(type);
        if (!market) return null;

        const activeBet = betByMarket.get(market.id) ?? null;
        return (
          <MarketCard
            key={market.id}
            market={market}
            activeBet={activeBet}
            isLocked={isLocked}
            specialWallet={specialWallet}
          />
        );
      })}

      {markets.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          Inga specialmarknader är öppna ännu.
        </p>
      )}

      {/* Reveal section — shown only if deadline passed (or admin). null = before deadline. */}
      {othersReveal === null ? (
        deadline && !deadlinePassed && <BeforeDeadlineNotice />
      ) : (
        <OthersRevealSection
          othersReveal={othersReveal}
          markets={markets}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
