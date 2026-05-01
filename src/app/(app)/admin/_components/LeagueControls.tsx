"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleLeague, updateTournamentStatus } from "../actions";
import type { League, Tournament, TournamentStatus } from "@/types";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Sparar…" : label}
    </button>
  );
}

function Feedback({ state }: { state: { error?: string; success?: string } | null }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="text-sm text-[var(--loss)]">{state.error}</p>;
  return <p className="text-sm text-[var(--win)]">{state.success}</p>;
}

const STATUS_OPTIONS: { value: TournamentStatus; label: string }[] = [
  { value: "upcoming", label: "Kommande" },
  { value: "group_stage", label: "Gruppspel" },
  { value: "knockout", label: "Slutspel" },
  { value: "finished", label: "Avslutad" },
];

interface Props {
  league: League;
  tournament: Tournament;
}

export function LeagueControls({ league, tournament }: Props) {
  const [leagueState, leagueAction] = useActionState(toggleLeague, null);
  const [tournamentState, tournamentAction] = useActionState(updateTournamentStatus, null);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Liga & turnering</h2>

      {/* Liga open/closed */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{league.name}</p>
            <p className="text-xs text-gray-500">
              Status:{" "}
              <span className={league.is_open ? "text-[var(--win)]" : "text-[var(--loss)]"}>
                {league.is_open ? "Öppen" : "Stängd"}
              </span>
            </p>
          </div>
          <form action={leagueAction}>
            <input type="hidden" name="new_open" value={league.is_open ? "false" : "true"} />
            <SubmitButton label={league.is_open ? "Stäng ligan" : "Öppna ligan"} />
          </form>
        </div>
        <Feedback state={leagueState} />
      </div>

      {/* Tournament status */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-sm font-medium text-gray-900">{tournament.name}</p>
        <form action={tournamentAction} className="flex items-center gap-3">
          <input type="hidden" name="tournament_id" value={tournament.id} />
          <select
            name="status"
            defaultValue={tournament.status}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <SubmitButton label="Spara" />
        </form>
        <Feedback state={tournamentState} />
      </div>
    </section>
  );
}
