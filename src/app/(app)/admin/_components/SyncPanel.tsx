"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { runOddsSync, runResultsSync } from "../actions";
import type { ActionState } from "../actions";

function SyncButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Kör…" : label}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if ("error" in state)
    return <p className="text-sm text-[var(--loss)]">{state.error}</p>;
  return <p className="text-sm text-[var(--win)]">{state.success}</p>;
}

export function SyncPanel() {
  const [oddsState, oddsAction] = useActionState(runOddsSync, null);
  const [resultsState, resultsAction] = useActionState(runResultsSync, null);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Manuell sync</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Kör sync manuellt vid behov. Odds med källa &quot;admin&quot; påverkas aldrig av API-sync.
          Cron kör automatiskt en gång per natt som backup.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Odds — The Odds API</p>
          <form action={oddsAction} className="flex flex-wrap items-center gap-3">
            <SyncButton label="Kör odds-sync" />
            <Feedback state={oddsState} />
          </form>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Resultat — football-data.org</p>
          <form action={resultsAction} className="flex flex-wrap items-center gap-3">
            <SyncButton label="Kör resultat-sync" />
            <Feedback state={resultsState} />
          </form>
        </div>
      </div>
    </section>
  );
}
