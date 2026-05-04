"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { correctMatchResult } from "../actions";
import type { MatchWithTeams, MatchStatus } from "@/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Sparar…" : "Spara resultat"}
    </button>
  );
}

function Feedback({ state }: { state: { error?: string; success?: string } | null }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-[var(--loss)]">{state.error}</p>;
  return <p className="text-sm text-[var(--win)]">{state.success}</p>;
}

const STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "scheduled", label: "Planerad" },
  { value: "live",      label: "Pågår" },
  { value: "finished",  label: "Avslutad" },
  { value: "void",      label: "Ogiltigförklarad" },
];

function matchLabel(m: MatchWithTeams): string {
  const home = m.home_team ? `${m.home_team.flag_emoji ?? ""} ${m.home_team.short_name}` : "?";
  const away = m.away_team ? `${m.away_team.flag_emoji ?? ""} ${m.away_team.short_name}` : "?";
  const date = new Date(m.scheduled_at).toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
    timeZone: "Europe/Stockholm",
  });
  const statusMark =
    m.status === "finished"
      ? ` ${m.home_score}–${m.away_score}`
      : m.status === "live"
      ? " ▶"
      : "";
  return `#${m.match_number} ${home} – ${away} (${date})${statusMark}`;
}

// ─── Form fields — remounted via key when selected match changes ──────────────
// key={match.id} on this component means React tears it down and rebuilds it
// every time the selected match changes, resetting defaultValues and action state.

function ResultFields({ match }: { match: MatchWithTeams }) {
  const [state, action] = useActionState(correctMatchResult, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="match_id" value={match.id} />

      {/* Status */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-700" htmlFor="result-status">
          Status
        </label>
        <select
          id="result-status"
          name="status"
          defaultValue={match.status}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* FT Scores */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="home-score">
            Hemmamål (FT)
          </label>
          <input
            id="home-score"
            name="home_score"
            type="number"
            min="0"
            defaultValue={match.home_score ?? ""}
            placeholder="0"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="away-score">
            Bortamål (FT)
          </label>
          <input
            id="away-score"
            name="away_score"
            type="number"
            min="0"
            defaultValue={match.away_score ?? ""}
            placeholder="0"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* HT Scores */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="home-score-ht">
            Hemmamål (HT, valfritt)
          </label>
          <input
            id="home-score-ht"
            name="home_score_ht"
            type="number"
            min="0"
            defaultValue={match.home_score_ht ?? ""}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="away-score-ht">
            Bortamål (HT, valfritt)
          </label>
          <input
            id="away-score-ht"
            name="away_score_ht"
            type="number"
            min="0"
            defaultValue={match.away_score_ht ?? ""}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <SubmitButton />
      </div>
    </form>
  );
}

// ─── MatchResultForm ──────────────────────────────────────────────────────────

interface Props {
  matches: MatchWithTeams[];
}

export function MatchResultForm({ matches }: Props) {
  const [selectedId, setSelectedId] = useState(matches[0]?.id ?? "");
  const selectedMatch = matches.find((m) => m.id === selectedId) ?? matches[0];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">1</span>
        <h2 className="text-base font-semibold text-gray-900">Sätt matchresultat</h2>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Välj match, sätt status till <strong>Avslutad</strong> och fyll i resultatet. Gå sedan till <strong>Steg 2</strong> nedan för att avgöra slip.
        </p>

        {/* Match selector — controlled, outside the keyed form */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="result-match">
            Match
          </label>
          <select
            id="result-match"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {matchLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {/* Form fields — key forces remount on match change, resetting all state */}
        {selectedMatch && <ResultFields key={selectedMatch.id} match={selectedMatch} />}
      </div>
    </section>
  );
}
