"use client";

import type { MatchWithTeamsAndOdds, BetOutcome } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  selections:       LocalSelection[];
  matchMap:         Map<string, MatchWithTeamsAndOdds>;
  stake:            string;
  maxStake:         number;
  stakeError:       string | null;
  combinedOdds:     number;
  potentialPayout:  number;
  canSubmit:        boolean;
  isPending:        boolean;
  errorMsg:         string | null;
  oddsChangedInfo:  OddsChangedInfo | null;
  isOpen:           boolean;
  onToggleOpen:     () => void;
  onStakeChange:    (val: string) => void;
  onRemoveSelection:(matchId: string) => void;
  onClear:          () => void;
  onSubmit:         () => void;
}

// ─── SlipPanel ────────────────────────────────────────────────────────────────

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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-xl">
      {/* ── Collapsed bar ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Stäng kupong" : "Öppna kupong"}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            {count}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {count === 1 ? "1 match vald" : `${count} matcher valda`}
          </span>
          {count > 1 && (
            <span className="text-sm text-gray-500 tabular-nums">{combinedOdds.toFixed(2)}x</span>
          )}
          {hasOddsChanged && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Odds ändrade!
            </span>
          )}
        </div>

        <span className="text-base text-gray-400" aria-hidden>
          {isOpen ? "↓" : "↑"}
        </span>
      </button>

      {/* ── Expanded content ───────────────────────────────────────────── */}
      {isOpen && (
        <div className="max-h-[68vh] overflow-y-auto border-t border-gray-100">
          {/* Selections list */}
          <ul className="px-4 pt-3 space-y-2">
            {selections.map((sel) => {
              const match      = matchMap.get(sel.matchId);
              const isChanged  = oddsChangedInfo?.matchId === sel.matchId;
              const homeTeam   = match?.home_team;
              const awayTeam   = match?.away_team;

              return (
                <li
                  key={sel.matchId}
                  className={`flex items-center justify-between rounded-lg p-2.5 ${
                    isChanged ? "border border-amber-200 bg-amber-50" : "bg-gray-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-gray-900">
                      {homeTeam?.flag_emoji} {homeTeam?.short_name ?? "?"}&nbsp;–&nbsp;
                      {awayTeam?.flag_emoji} {awayTeam?.short_name ?? "?"}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">{OUTCOME_LABEL[sel.outcome]}</span>
                      <span
                        className={`tabular-nums text-xs font-semibold ${
                          isChanged ? "text-amber-700" : "text-blue-600"
                        }`}
                      >
                        {isChanged && "→ "}
                        {sel.oddsSnapshot.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveSelection(sel.matchId)}
                    aria-label="Ta bort från kupong"
                    className="ml-3 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Combined odds */}
          {count > 1 && (
            <div className="mx-4 mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <span className="text-xs text-gray-500">Kombinerat odds</span>
              <span className="text-sm font-bold tabular-nums text-gray-900">
                {combinedOdds.toFixed(2)}x
              </span>
            </div>
          )}

          {/* Stake row */}
          <div className="mx-4 mt-3 border-t border-gray-100 pt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="slip-stake" className="text-xs font-medium text-gray-700">
                Insats (coins)
              </label>
              <span className="text-xs text-gray-400">
                Max {maxStake.toLocaleString("sv-SE")}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjustStake(-10)}
                aria-label="Minska insats med 10"
                className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 active:bg-gray-300"
              >
                −
              </button>

              <input
                id="slip-stake"
                type="number"
                inputMode="numeric"
                value={stake}
                min={10}
                max={maxStake}
                step={10}
                onChange={(e) => onStakeChange(e.target.value)}
                className={`flex-1 rounded-lg border py-2 text-center text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 ${
                  stakeError
                    ? "border-red-300 text-red-600 focus:ring-red-200"
                    : "border-gray-200 text-gray-900 focus:ring-blue-200"
                }`}
              />

              <button
                type="button"
                onClick={() => adjustStake(10)}
                aria-label="Öka insats med 10"
                className="shrink-0 rounded-lg bg-gray-100 px-3 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 active:bg-gray-300"
              >
                +
              </button>
            </div>

            {stakeError && (
              <p className="text-xs text-red-500">{stakeError}</p>
            )}
          </div>

          {/* Potential payout */}
          {potentialPayout > 0 && !stakeError && (
            <div className="mx-4 mt-2 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <span className="text-xs text-gray-500">Möjlig vinst</span>
              <span className="text-base font-bold text-green-700 tabular-nums">
                {potentialPayout.toLocaleString("sv-SE")} coins
              </span>
            </div>
          )}

          {/* Server error */}
          {errorMsg && (
            <div className="mx-4 mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{errorMsg}</p>
            </div>
          )}

          {/* Odds-changed summary banner */}
          {hasOddsChanged && (
            <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-medium text-amber-800">
                Oddsen har ändrats sedan du öppnade sidan.
                De nya oddsen visas ovan. Granska och tryck Bekräfta.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 px-4 pb-8 pt-3">
            <button
              type="button"
              onClick={onClear}
              className="w-1/3 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            >
              Rensa
            </button>

            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors ${
                !canSubmit
                  ? "cursor-not-allowed bg-gray-300"
                  : hasOddsChanged
                    ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {isPending
                ? "Placerar…"
                : hasOddsChanged
                  ? "Bekräfta och skicka"
                  : "Lägg slip"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
