"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleLeague, updateTournamentStatus, updateSpecialBetsDeadline } from "../actions";
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

// Convert UTC ISO string to "YYYY-MM-DDTHH:mm" in Stockholm time for datetime-local input
function toStockholmLocal(utcIso: string | null): string {
  if (!utcIso) return "";
  const d = new Date(utcIso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${pad(+parts.month)}-${pad(+parts.day)}T${pad(+parts.hour)}:${pad(+parts.minute)}`;
}

export function LeagueControls({ league, tournament }: Props) {
  const [leagueState, leagueAction] = useActionState(toggleLeague, null);
  const [tournamentState, tournamentAction] = useActionState(updateTournamentStatus, null);
  const [deadlineState, deadlineAction] = useActionState(updateSpecialBetsDeadline, null);

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

      {/* Specialbet-deadline */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Specialbet-deadline</p>
          <p className="text-xs text-gray-500">
            Andras bets avslöjas för alla spelare efter denna tidpunkt.
          </p>
        </div>
        <form action={deadlineAction} className="flex items-center gap-3">
          <input type="hidden" name="tournament_id" value={tournament.id} />
          <input
            type="datetime-local"
            name="deadline"
            defaultValue={toStockholmLocal(tournament.special_bets_deadline)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <SubmitButton label="Spara" />
        </form>
        {tournament.special_bets_deadline && (
          <p className="text-xs text-gray-400">
            Nuvarande:{" "}
            {new Date(tournament.special_bets_deadline).toLocaleString("sv-SE", {
              timeZone: "Europe/Stockholm",
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        )}
        <Feedback state={deadlineState} />
      </div>
    </section>
  );
}
