"use client";

import type { MatchWithTeamsAndOdds, MatchStatus } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function swTime(utc: string) {
  return new Date(utc).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

const STAGE_LABEL: Record<string, string> = {
  group:       "Grupp",
  r32:         "Omgång 32",
  r16:         "Omgång 16",
  qf:          "Kvartsfinal",
  sf:          "Semifinal",
  "3rd_place": "Bronsmatch",
  final:       "Final",
};

// null label = don't show (scheduled is the default, no badge needed)
const STATUS_CONFIG: Record<MatchStatus, { label: string | null; cls: string }> = {
  scheduled: { label: null,            cls: "" },
  live:      { label: "Pågår",         cls: "text-green-600 font-semibold" },
  finished:  { label: "Avslutad",      cls: "text-gray-400" },
  void:      { label: "Ogiltig",       cls: "text-red-500" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamCol({ flag, name }: { flag: string | null; name: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="text-2xl leading-none">{flag ?? "🏳"}</span>
      <span className="truncate text-center text-xs font-medium text-gray-800">{name}</span>
    </div>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

interface Props {
  match: MatchWithTeamsAndOdds;
}

export function MatchCard({ match }: Props) {
  const hasScore   = match.home_score !== null && match.away_score !== null;
  const isLive     = match.status === "live";
  const { label: statusLabel, cls: statusCls } = STATUS_CONFIG[match.status];

  const stageLabel =
    match.stage === "group" && match.group_letter
      ? `Grupp ${match.group_letter}`
      : STAGE_LABEL[match.stage] ?? match.stage;

  const isBettable = match.status === "scheduled" && match.odds !== null;
  const noOdds     = match.status === "scheduled" && match.odds === null;

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm ${
        isLive ? "border-green-300" : "border-gray-200"
      }`}
    >
      {/* Top row */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">
          #{match.match_number} · {stageLabel}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-gray-500">{swTime(match.scheduled_at)}</span>
          {statusLabel && (
            <span className={`flex items-center gap-1 text-xs ${statusCls}`}>
              {isLive && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              )}
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center gap-2">
        <TeamCol
          flag={match.home_team?.flag_emoji ?? null}
          name={match.home_team?.short_name ?? "TBD"}
        />

        {hasScore ? (
          <div className="flex shrink-0 flex-col items-center">
            <span className="text-xl font-bold tabular-nums text-gray-900">
              {match.home_score}&thinsp;–&thinsp;{match.away_score}
            </span>
            {match.home_score_ht !== null && match.away_score_ht !== null && (
              <span className="text-xs text-gray-400">
                ({match.home_score_ht}–{match.away_score_ht} HT)
              </span>
            )}
          </div>
        ) : (
          <span className="shrink-0 text-sm text-gray-300">vs</span>
        )}

        <TeamCol
          flag={match.away_team?.flag_emoji ?? null}
          name={match.away_team?.short_name ?? "TBD"}
        />
      </div>

      {/* Odds row */}
      {match.odds && (
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
          <div className="flex gap-4 text-xs text-gray-600">
            <span>
              <span className="text-gray-400">H </span>
              <strong>{match.odds.home_odds}</strong>
            </span>
            <span>
              <span className="text-gray-400">X </span>
              <strong>{match.odds.draw_odds}</strong>
            </span>
            <span>
              <span className="text-gray-400">B </span>
              <strong>{match.odds.away_odds}</strong>
            </span>
          </div>
          {isBettable && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              Spelbar
            </span>
          )}
        </div>
      )}

      {noOdds && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <span className="text-xs text-gray-400">Inga odds</span>
        </div>
      )}
    </div>
  );
}
