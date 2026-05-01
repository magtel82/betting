"use client";

import { useActionState, useRef } from "react";
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

interface Props {
  matches: MatchRow[];
}

export function MatchOddsForm({ matches }: Props) {
  const [state, action] = useActionState(setMatchOdds, null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Find currently selected match to pre-fill existing odds
  const selectedMatchId = selectRef.current?.value ?? matches[0]?.id ?? "";
  const selectedMatch = matches.find((m) => m.id === selectedMatchId);
  const currentOdds = selectedMatch?.odds ?? null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Matchodds (manuell)</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Sätt eller uppdatera odds manuellt som fallback. Välj match, fyll i odds och spara.
        </p>
        <form action={action} className="space-y-4">
          {/* Match selector */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700" htmlFor="odds-match">
              Match
            </label>
            <select
              id="odds-match"
              name="match_id"
              ref={selectRef}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                  {m.odds ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Odds inputs */}
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
                placeholder={currentOdds ? String(currentOdds.home_odds) : "1.50"}
                defaultValue={currentOdds?.home_odds ?? ""}
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
                placeholder={currentOdds ? String(currentOdds.draw_odds) : "3.50"}
                defaultValue={currentOdds?.draw_odds ?? ""}
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
                placeholder={currentOdds ? String(currentOdds.away_odds) : "5.00"}
                defaultValue={currentOdds?.away_odds ?? ""}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>

          {currentOdds && (
            <p className="text-xs text-gray-400">
              Nuvarande odds (
              {currentOdds.source === "admin" ? "manuell" : "API"}
              ): {currentOdds.home_odds} / {currentOdds.draw_odds} / {currentOdds.away_odds}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <Feedback state={state} />
            <SubmitButton />
          </div>
        </form>
      </div>
    </section>
  );
}
