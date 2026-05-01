"use client";

import type { MatchWithTeamsAndOdds, BetOutcome } from "@/types";

export interface LocalSelection {
  matchId:      string;
  outcome:      BetOutcome;
  oddsSnapshot: number;
}

interface OddsChangedInfo {
  matchId: string;
  newOdds: number;
}

const OUTCOME_LABEL: Record<BetOutcome, string> = {
  home: "Hemma vinner",
  draw: "Oavgjort",
  away: "Borta vinner",
};

interface Props {
  selections:        LocalSelection[];
  matchMap:          Map<string, MatchWithTeamsAndOdds>;
  stake:             string;
  maxStake:          number;
  stakeError:        string | null;
  combinedOdds:      number;
  potentialPayout:   number;
  canSubmit:         boolean;
  isPending:         boolean;
  errorMsg:          string | null;
  oddsChangedInfo:   OddsChangedInfo | null;
  isOpen:            boolean;
  isAmendMode:       boolean;
  isSidebar?:        boolean;
  onToggleOpen:      () => void;
  onStakeChange:     (val: string) => void;
  onRemoveSelection: (matchId: string) => void;
  onClear:           () => void;
  onSubmit:          () => void;
}

export function SlipPanel({
  selections,
  matchMap,
  stake,
  maxStake,
  stakeError,
  combinedOdds,
  potentialPayout,
  canSubmit,
  isPending,
  errorMsg,
  oddsChangedInfo,
  isOpen,
  isAmendMode,
  isSidebar = false,
  onToggleOpen,
  onStakeChange,
  onRemoveSelection,
  onClear,
  onSubmit,
}: Props) {
  const count          = selections.length;
  const hasOddsChanged = oddsChangedInfo !== null;

  function adjustStake(delta: number) {
    const current = parseInt(stake, 10);
    if (isNaN(current)) return;
    const next = current + delta;
    if (next < 10 || next > maxStake) return;
    onStakeChange(String(next));
  }

  // ─── Sidebar (desktop) ───────────────────────────────────────────────────────
  if (isSidebar) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
            {count}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {count === 1 ? "1 match vald" : `${count} matcher valda`}
          </span>
          {count > 1 && (
            <span className="text-sm font-semibold tabular-nums text-[var(--primary)]">{combinedOdds.toFixed(2)}x</span>
          )}
          {hasOddsChanged && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Odds ändrade!
            </span>
          )}
        </div>

        <div className="max-h-[45vh] overflow-y-auto">
          <ul className="space-y-2 px-4 pb-2 pt-3">
            {selections.map((sel) => {
              const match     = matchMap.get(sel.matchId);
              const isChanged = oddsChangedInfo?.matchId === sel.matchId;
              return (
                <li
                  key={sel.matchId}
                  className={`flex items-center justify-between rounded-lg p-2.5 ${
                    isChanged ? "border border-amber-200 bg-amber-50" : "bg-gray-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {match?.home_team?.flag_emoji} {match?.home_team?.short_name ?? "?"}&nbsp;–&nbsp;
                      {match?.away_team?.flag_emoji} {match?.away_team?.short_name ?? "?"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">{OUTCOME_LABEL[sel.outcome]}</span>
                      <span className={`tabular-nums text-xs font-semibold ${isChanged ? "text-amber-700" : "text-gray-800"}`}>
                        {isChanged && "→ "}{Number(sel.oddsSnapshot).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveSelection(sel.matchId)}
                    aria-label="Ta bort från kupong"
                    className="ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-gray-200"
                  >✕</button>
                </li>
              );
            })}
          </ul>
          {count > 1 && (
            <div className="mx-4 mb-2 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <span className="text-xs text-gray-500">Kombinerat odds</span>
              <span className="text-sm font-bold tabular-nums text-gray-900">{combinedOdds.toFixed(2)}x</span>
            </div>
          )}
        </div>

        {/* Stake */}
        <div className="border-t border-gray-100 px-4 pb-2 pt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="slip-stake-sidebar" className="text-xs font-semibold text-gray-700">Insats</label>
            <span className="text-xs text-gray-400">Max {maxStake.toLocaleString("sv-SE")} 🪙</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => adjustStake(-10)} aria-label="Minska insats med 10"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300">−</button>
            <input
              id="slip-stake-sidebar"
              type="number" inputMode="numeric" value={stake} min={10} max={maxStake} step={10}
              onChange={(e) => onStakeChange(e.target.value)}
              className={`flex-1 rounded-lg border h-11 text-center text-base font-bold tabular-nums focus:outline-none focus:ring-2 ${
                stakeError ? "border-red-300 text-red-600 focus:ring-red-200" : "border-gray-200 text-gray-900 focus:ring-[var(--primary)]/30"
              }`}
            />
            <button type="button" onClick={() => adjustStake(10)} aria-label="Öka insats med 10"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gray-100 text-lg font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300">+</button>
          </div>
          {stakeError && <p className="text-xs text-[var(--loss)]">{stakeError}</p>}
        </div>

        {potentialPayout > 0 && !stakeError && (
          <div className="mx-4 flex items-center justify-between border-t border-gray-100 pb-1 pt-2.5">
            <span className="text-xs text-gray-500">Möjlig vinst</span>
            <span className="text-base font-bold tabular-nums text-[var(--win)]">{potentialPayout.toLocaleString("sv-SE")} 🪙</span>
          </div>
        )}
        {errorMsg && (
          <div className="mx-4 mt-2 rounded-lg border border-[var(--loss)]/20 bg-[var(--loss-50)] px-3 py-2">
            <p className="text-xs text-[var(--loss)]">{errorMsg}</p>
          </div>
        )}
        {hasOddsChanged && (
          <div className="mx-4 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-800">Oddsen har ändrats. Granska ovan och bekräfta.</p>
          </div>
        )}

        <div className="flex gap-2 border-t border-gray-100 px-4 pb-4 pt-3">
          <button type="button" onClick={onClear}
            className="h-12 w-1/3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100">
            Rensa
          </button>
          <button type="button" onClick={onSubmit} disabled={!canSubmit}
            className={`h-12 flex-1 rounded-lg text-sm font-bold text-white shadow-sm transition-colors ${
              !canSubmit ? "cursor-not-allowed bg-gray-200 text-gray-400 shadow-none"
              : hasOddsChanged ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
              : "bg-[var(--primary)] hover:bg-[var(--primary-600)] active:bg-[var(--primary-600)]"
            }`}>
            {isPending ? (isAmendMode ? "Ändrar…" : "Placerar…")
              : hasOddsChanged ? "Bekräfta och skicka"
              : isAmendMode ? "Ändra slip"
              : "Lägg slip"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Mobile bottom sheet ─────────────────────────────────────────────────────
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[51] flex flex-col overflow-hidden border-t border-gray-200 bg-white shadow-xl transition-[max-height] duration-300 ease-out ${
        isOpen ? "max-h-[65vh]" : "max-h-16"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Summary bar — always visible (h-16 = 64 px touch-friendly) */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex h-16 w-full shrink-0 items-center justify-between gap-2 px-4 active:bg-gray-50"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Stäng kupong" : "Öppna kupong"}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
            {count}
          </span>
          <div className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-sm font-semibold text-gray-900">
              {count === 1 ? "1 match" : `${count} matcher`}
              {count > 1 && (
                <span className="ml-1.5 text-xs font-semibold tabular-nums text-[var(--primary)]">
                  {combinedOdds.toFixed(2)}x
                </span>
              )}
            </span>
            {potentialPayout > 0 && !stakeError ? (
              <span className="text-xs text-gray-500">
                Möjlig vinst{" "}
                <span className="font-semibold tabular-nums text-[var(--win)]">
                  {potentialPayout.toLocaleString("sv-SE")}
                </span>{" "}
                <span className="text-[var(--coin)]">🪙</span>
              </span>
            ) : (
              <span className="text-xs text-gray-400">Tryck för att lägga slip</span>
            )}
          </div>
          {hasOddsChanged && (
            <span className="ml-1 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Odds!
            </span>
          )}
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
             aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded sheet */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-gray-100">
        {/* Scrollable selections */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="space-y-2 px-4 pb-2 pt-3">
            {selections.map((sel) => {
              const match     = matchMap.get(sel.matchId);
              const isChanged = oddsChangedInfo?.matchId === sel.matchId;
              return (
                <li
                  key={sel.matchId}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    isChanged ? "border border-amber-200 bg-amber-50" : "bg-gray-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {match?.home_team?.flag_emoji} {match?.home_team?.short_name ?? "?"}&nbsp;–&nbsp;
                      {match?.away_team?.flag_emoji} {match?.away_team?.short_name ?? "?"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">{OUTCOME_LABEL[sel.outcome]}</span>
                      <span className={`tabular-nums text-xs font-semibold ${isChanged ? "text-amber-700" : "text-gray-800"}`}>
                        {isChanged && "→ "}{Number(sel.oddsSnapshot).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveSelection(sel.matchId)}
                    aria-label="Ta bort från kupong"
                    className="ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-gray-200 active:bg-gray-300"
                  >✕</button>
                </li>
              );
            })}
          </ul>
          {count > 1 && (
            <div className="mx-4 mb-2 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <span className="text-xs text-gray-500">Kombinerat odds</span>
              <span className="text-sm font-bold tabular-nums text-gray-900">{combinedOdds.toFixed(2)}x</span>
            </div>
          )}
        </div>

        {/* Stake + CTA — always pinned at bottom of the sheet */}
        <div className="shrink-0 space-y-3 border-t border-gray-100 px-4 pb-5 pt-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="slip-stake" className="text-xs font-semibold text-gray-700">Insats</label>
              <span className="text-xs text-gray-400">Max {maxStake.toLocaleString("sv-SE")} 🪙</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => adjustStake(-10)} aria-label="Minska insats med 10"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300">−</button>
              <input
                id="slip-stake"
                type="number" inputMode="numeric" value={stake} min={10} max={maxStake} step={10}
                onChange={(e) => onStakeChange(e.target.value)}
                className={`flex-1 rounded-lg border h-12 text-center text-lg font-bold tabular-nums focus:outline-none focus:ring-2 ${
                  stakeError ? "border-red-300 text-red-600 focus:ring-red-200" : "border-gray-200 text-gray-900 focus:ring-[var(--primary)]/30"
                }`}
              />
              <button type="button" onClick={() => adjustStake(10)} aria-label="Öka insats med 10"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gray-100 text-xl font-bold text-gray-700 hover:bg-gray-200 active:bg-gray-300">+</button>
            </div>
            {stakeError && <p className="text-xs text-[var(--loss)]">{stakeError}</p>}
          </div>

          {potentialPayout > 0 && !stakeError && (
            <div className="flex items-center justify-between rounded-lg bg-[var(--win-50)] px-3 py-2">
              <span className="text-xs font-medium text-gray-600">Möjlig vinst</span>
              <span className="text-base font-bold tabular-nums text-[var(--win)]">{potentialPayout.toLocaleString("sv-SE")} 🪙</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-[var(--loss)]/20 bg-[var(--loss-50)] px-3 py-2">
              <p className="text-xs text-[var(--loss)]">{errorMsg}</p>
            </div>
          )}
          {hasOddsChanged && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-800">
                Oddsen har ändrats sedan sidan laddades. Granska och tryck Bekräfta.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClear}
              className="h-12 w-1/3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:bg-gray-100">
              Rensa
            </button>
            <button type="button" onClick={onSubmit} disabled={!canSubmit}
              className={`h-12 flex-1 rounded-lg text-sm font-bold text-white shadow-sm transition-colors ${
                !canSubmit ? "cursor-not-allowed bg-gray-200 text-gray-400 shadow-none"
                : hasOddsChanged ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                : "bg-[var(--primary)] hover:bg-[var(--primary-600)] active:bg-[var(--primary-600)]"
              }`}>
              {isPending ? (isAmendMode ? "Ändrar…" : "Placerar…")
                : hasOddsChanged ? "Bekräfta och skicka"
                : isAmendMode ? "Ändra slip"
                : "Lägg slip"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
