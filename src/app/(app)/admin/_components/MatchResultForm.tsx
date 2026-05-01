"use client";

import { useActionState } from "react";
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

interface Props {
  matches: MatchWithTeams[];
}

export function MatchResultForm({ matches }: Props) {
  const [state, action] = useActionState(correctMatchResult, null);

  const defaultMatch = matches[0];

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Matchresultat (manuell)</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Rätta matchresultat och status manuellt. Settlement körs separat (fas 6).
        </p>
        <form action={action} className="space-y-4">
          {/* Match selector */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700" htmlFor="result-match">
              Match
            </label>
            <select
              id="result-match"
              name="match_id"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchLabel(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700" htmlFor="result-status">
              Status
            </label>
            <select
              id="result-status"
              name="status"
              defaultValue={defaultMatch?.status ?? "scheduled"}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scores */}
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
                placeholder={
                  defaultMatch?.home_score != null
                    ? String(defaultMatch.home_score)
                    : "0"
                }
                defaultValue={defaultMatch?.home_score ?? ""}
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
                placeholder={
                  defaultMatch?.away_score != null
                    ? String(defaultMatch.away_score)
                    : "0"
                }
                defaultValue={defaultMatch?.away_score ?? ""}
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
                placeholder={
                  defaultMatch?.home_score_ht != null
                    ? String(defaultMatch.home_score_ht)
                    : ""
                }
                defaultValue={defaultMatch?.home_score_ht ?? ""}
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
                placeholder={
                  defaultMatch?.away_score_ht != null
                    ? String(defaultMatch.away_score_ht)
                    : ""
                }
                defaultValue={defaultMatch?.away_score_ht ?? ""}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Feedback state={state} />
            <SubmitButton />
          </div>
        </form>
      </div>
    </section>
  );
}
