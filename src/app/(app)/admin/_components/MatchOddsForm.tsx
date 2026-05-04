"use client";

import { useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setMatchOdds } from "../actions";
import type { MatchWithTeams, MatchOdds } from "@/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Sparar…" : "Spara odds"}
    </button>
  );
}

function Feedback({ state }: { state: { error?: string; success?: string } | null }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-[var(--loss)]">{state.error}</p>;
  return <p className="text-sm text-[var(--win)]">{state.success}</p>;
}

function matchLabel(m: MatchWithTeams): string {
  const home = m.home_team ? `${m.home_team.flag_emoji ?? ""} ${m.home_team.short_name}` : "?";
  const away = m.away_team ? `${m.away_team.flag_emoji ?? ""} ${m.away_team.short_name}` : "?";
  const date = new Date(m.scheduled_at).toLocaleDateString("sv-SE", {
    month: "short",
    day: "numeric",
    timeZone: "Europe/Stockholm",
  });
  return `#${m.match_number} ${home} – ${away} (${date})`;
}

interface MatchRow extends MatchWithTeams {
  odds: MatchOdds | null;
}

// ─── Odds fields — remounted via key when selected match changes ──────────────

function OddsFields({ match }: { match: MatchRow }) {
  const [state, action] = useActionState(setMatchOdds, null);
  const odds = match.odds;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="match_id" value={match.id} />

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="home-odds">
            Hemma
          </label>
          <input
            id="home-odds"
            name="home_odds"
            type="number"
            step="0.01"
            min="1.01"
            defaultValue={odds?.home_odds ?? ""}
            placeholder={odds ? String(odds.home_odds) : "1.50"}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="draw-odds">
            Oavgjort
          </label>
          <input
            id="draw-odds"
            name="draw_odds"
            type="number"
            step="0.01"
            min="1.01"
            defaultValue={odds?.draw_odds ?? ""}
            placeholder={odds ? String(odds.draw_odds) : "3.50"}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="away-odds">
            Borta
          </label>
          <input
            id="away-odds"
            name="away_odds"
            type="number"
            step="0.01"
            min="1.01"
            defaultValue={odds?.away_odds ?? ""}
            placeholder={odds ? String(odds.away_odds) : "5.00"}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
        </div>
      </div>

      {odds && (
        <p className="text-xs text-gray-400">
          Nuvarande odds ({odds.source === "admin" ? "manuell" : "API"}): {odds.home_odds} / {odds.draw_odds} / {odds.away_odds}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <SubmitButton />
      </div>
    </form>
  );
}

// ─── MatchOddsForm ────────────────────────────────────────────────────────────

interface Props {
  matches: MatchRow[];
}

export function MatchOddsForm({ matches }: Props) {
  const [selectedId, setSelectedId] = useState(matches[0]?.id ?? "");
  const selectedMatch = matches.find((m) => m.id === selectedId) ?? matches[0];

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Matchodds (manuell)</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Sätt eller uppdatera odds manuellt som fallback. Välj match, fyll i odds och spara.
        </p>

        {/* Match selector — controlled, outside the keyed form */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700" htmlFor="odds-match">
            Match
          </label>
          <select
            id="odds-match"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {matchLabel(m)}{m.odds ? " ✓" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Odds fields — key forces remount on match change, resetting all state */}
        {selectedMatch && <OddsFields key={selectedMatch.id} match={selectedMatch} />}
      </div>
    </section>
  );
}
