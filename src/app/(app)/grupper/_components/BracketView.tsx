"use client";

import { useState } from "react";
import type { BracketMatch } from "@/lib/knockout-bracket";

interface Props {
  matches: BracketMatch[];
}

type Round = "r32" | "r16" | "qf" | "sf" | "final";

const ROUNDS: { key: Round; label: string }[] = [
  { key: "r32",   label: "R32"  },
  { key: "r16",   label: "R16"  },
  { key: "qf",    label: "KF"   },
  { key: "sf",    label: "SF"   },
  { key: "final", label: "Final"},
];

const ROUND_TITLE: Record<Round, string> = {
  r32:   "Omgång av 32",
  r16:   "Omgång av 16",
  qf:    "Kvartsfinaler",
  sf:    "Semifinaler",
  final: "Final & bronsmatch",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function MatchCard({ match }: { match: BracketMatch }) {
  const { home, away, homeScore, awayScore, status, scheduledAt } = match;
  const finished  = status === "finished";
  const homeWon   = finished && homeScore !== null && awayScore !== null && homeScore > awayScore;
  const awayWon   = finished && homeScore !== null && awayScore !== null && awayScore > homeScore;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2.5 flex items-center gap-2">
        {/* Home */}
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${homeWon ? "font-semibold" : ""}`}>
          <span className="text-base shrink-0">
            {home.team?.flag ?? "🏳"}
          </span>
          <span className={`text-sm truncate ${home.team ? "text-gray-900" : "text-gray-400"}`}>
            {home.team?.shortName ?? home.label}
          </span>
        </div>

        {/* Score / time */}
        <div className="shrink-0 text-center w-16">
          {finished && homeScore !== null && awayScore !== null ? (
            <span className="text-sm font-bold tabular-nums text-gray-900">
              {homeScore} – {awayScore}
            </span>
          ) : (
            <span className="text-xs text-gray-400 leading-tight">
              {formatDate(scheduledAt)}
            </span>
          )}
        </div>

        {/* Away */}
        <div className={`flex items-center gap-1.5 flex-1 min-w-0 justify-end ${awayWon ? "font-semibold" : ""}`}>
          <span className={`text-sm truncate text-right ${away.team ? "text-gray-900" : "text-gray-400"}`}>
            {away.team?.shortName ?? away.label}
          </span>
          <span className="text-base shrink-0">
            {away.team?.flag ?? "🏳"}
          </span>
        </div>
      </div>

    </div>
  );
}

export function BracketView({ matches }: Props) {
  const [round, setRound] = useState<Round>("r32");

  const filteredMatches = matches.filter((m) => {
    if (round === "final") return m.stage === "final" || m.stage === "3rd_place";
    return m.stage === round;
  });

  // Sort: 3rd_place before final
  const sorted = [...filteredMatches].sort((a, b) => {
    if (a.stage === "3rd_place" && b.stage === "final") return -1;
    if (a.stage === "final" && b.stage === "3rd_place") return 1;
    return a.matchNumber - b.matchNumber;
  });

  return (
    <div>
      {/* Round selector */}
      <div className="sticky top-[61px] z-30 flex gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 scrollbar-none">
        {ROUNDS.map((r) => (
          <button
            key={r.key}
            onClick={() => setRound(r.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              round === r.key
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-lg px-4 py-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          {ROUND_TITLE[round]}
        </h2>

        {sorted.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">
            Inga matcher i denna runda.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((m) => (
              <div key={m.id}>
                {round === "final" && m.stage === "3rd_place" && (
                  <p className="text-xs text-gray-400 font-medium mb-1 mt-2">Bronsmatch</p>
                )}
                {round === "final" && m.stage === "final" && (
                  <p className="text-xs text-gray-500 font-semibold mb-1 mt-4 uppercase tracking-wide">Final</p>
                )}
                <MatchCard match={m} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
