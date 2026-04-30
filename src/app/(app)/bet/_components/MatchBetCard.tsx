"use client";

import type { MatchWithTeamsAndOdds, BetOutcome } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  group:       "Grupp",
  r32:         "Omg. 32",
  r16:         "Omg. 16",
  qf:          "QF",
  sf:          "SF",
  "3rd_place": "Bronsmatch",
  final:       "Final",
};

function swTime(utc: string) {
  return new Date(utc).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

// ─── OddsButton ───────────────────────────────────────────────────────────────

interface OddsButtonProps {
  label:      string;
  odds:       number;
  selected:   boolean;
  disabled:   boolean;
  onClick:    () => void;
  highlight?: boolean; // amber for odds-changed state
}

function OddsButton({ label, odds, selected, disabled, onClick, highlight }: OddsButtonProps) {
  const base    = "flex flex-1 flex-col items-center justify-center rounded-lg min-h-[64px] px-1 text-xs transition-colors select-none";
  const active  = highlight
    ? "bg-amber-500 text-white font-semibold"
    : "bg-gray-900 text-white font-semibold";
  const idle    = "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300";
  const off     = "bg-gray-50 text-gray-300 cursor-not-allowed";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`${base} ${selected ? active : disabled ? off : idle}`}
    >
      <span className="font-semibold leading-none">{label}</span>
      <span className={`mt-1 tabular-nums text-[12px] font-medium ${selected ? "opacity-75" : "text-gray-500"}`}>
        {odds.toFixed(2)}
      </span>
    </button>
  );
}

// ─── MatchBetCard ─────────────────────────────────────────────────────────────

interface Props {
  match:              MatchWithTeamsAndOdds;
  selectedOutcome:    BetOutcome | null;
  onToggle:           (matchId: string, outcome: BetOutcome, odds: number) => void;
  isMaxed:            boolean;
  oddsChangedMatchId: string | null;
}

export function MatchBetCard({
  match,
  selectedOutcome,
  onToggle,
  isMaxed,
  oddsChangedMatchId,
}: Props) {
  const odds      = match.odds;
  const bettable  = odds !== null;
  const isChanged = oddsChangedMatchId === match.id;
  const isInSlip  = selectedOutcome !== null;

  const stageLabel =
    match.stage === "group" && match.group_letter
      ? `Grupp ${match.group_letter}`
      : (STAGE_LABEL[match.stage] ?? match.stage);

  function toggle(outcome: BetOutcome, oddsValue: number) {
    onToggle(match.id, outcome, oddsValue);
  }

  // A button is disabled when: no odds, OR the slip is full (5) and this match
  // is not already in it. If already in slip, buttons are still enabled (for deselect).
  function btnDisabled(outcome: BetOutcome) {
    if (!bettable) return true;
    if (isInSlip) return false; // always allow toggling a match that's already selected
    return isMaxed;
  }

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm transition-colors ${
        isChanged
          ? "border-amber-300"
          : isInSlip
            ? "border-gray-400"
            : "border-gray-200"
      }`}
    >
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs text-gray-400">#{match.match_number} · {stageLabel}</span>
        <span className="text-xs text-gray-500">{swTime(match.scheduled_at)}</span>
      </div>

      {/* Teams */}
      <div className="mb-3 flex items-center gap-2">
        {/* Home */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="shrink-0 text-xl leading-none">{match.home_team?.flag_emoji ?? "🏳"}</span>
          <span className="truncate text-sm font-semibold text-gray-900">
            {match.home_team?.short_name ?? "TBD"}
          </span>
        </div>

        <span className="shrink-0 text-xs text-gray-300">vs</span>

        {/* Away (right-aligned) */}
        <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-1.5">
          <span className="shrink-0 text-xl leading-none">{match.away_team?.flag_emoji ?? "🏳"}</span>
          <span className="truncate text-right text-sm font-semibold text-gray-900">
            {match.away_team?.short_name ?? "TBD"}
          </span>
        </div>
      </div>

      {/* Odds buttons or no-odds badge */}
      {bettable ? (
        <div className="flex gap-1.5">
          <OddsButton
            label="H"
            odds={odds.home_odds}
            selected={selectedOutcome === "home"}
            disabled={btnDisabled("home")}
            highlight={isChanged && selectedOutcome === "home"}
            onClick={() => toggle("home", odds.home_odds)}
          />
          <OddsButton
            label="X"
            odds={odds.draw_odds}
            selected={selectedOutcome === "draw"}
            disabled={btnDisabled("draw")}
            highlight={isChanged && selectedOutcome === "draw"}
            onClick={() => toggle("draw", odds.draw_odds)}
          />
          <OddsButton
            label="B"
            odds={odds.away_odds}
            selected={selectedOutcome === "away"}
            disabled={btnDisabled("away")}
            highlight={isChanged && selectedOutcome === "away"}
            onClick={() => toggle("away", odds.away_odds)}
          />
        </div>
      ) : (
        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-400">
          Inga odds — ej spelbar
        </span>
      )}

      {/* Odds-changed notice on the card itself */}
      {isChanged && (
        <p className="mt-2 text-xs font-medium text-amber-600">
          Oddsen har uppdaterats — kontrollera och bekräfta.
        </p>
      )}
    </div>
  );
}
