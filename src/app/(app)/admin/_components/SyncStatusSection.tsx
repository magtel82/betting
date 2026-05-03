"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { runOddsSync, runResultsSync, runOutrightsSyncAction } from "../actions";
import type { ActionState } from "../actions";

export type SyncLogRow = {
  id: number;
  type: "odds" | "results" | "outrights";
  ran_at: string;
  processed: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration_ms: number;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 2) return "just nu";
  if (diffMin < 60) return `${diffMin} min sedan`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h sedan`;
  return `${Math.round(diffH / 24)} d sedan`;
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function SyncButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-60"
    >
      {pending ? (
        <>
          <Spinner />
          Kör…
        </>
      ) : label}
    </button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if ("error" in state)
    return <span className="text-xs text-[var(--loss)]">{state.error}</span>;
  return <span className="text-xs text-[var(--win)]">{state.success}</span>;
}

const STALE_CUTOFF_MS = 25 * 60 * 60 * 1000;

interface Props {
  initialLogs: SyncLogRow[];
}

export function SyncStatusSection({ initialLogs }: Props) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [oddsState,      oddsAction]      = useActionState(runOddsSync, null);
  const [resultsState,   resultsAction]   = useActionState(runResultsSync, null);
  const [outrightState,  outrightAction]  = useActionState(runOutrightsSyncAction, null);

  const prevOddsState     = useRef<ActionState>(null);
  const prevResultsState  = useRef<ActionState>(null);
  const prevOutrightState = useRef<ActionState>(null);

  useEffect(() => {
    if (oddsState !== null && prevOddsState.current !== oddsState) router.refresh();
    prevOddsState.current = oddsState;
  }, [oddsState, router]);

  useEffect(() => {
    if (resultsState !== null && prevResultsState.current !== resultsState) router.refresh();
    prevResultsState.current = resultsState;
  }, [resultsState, router]);

  useEffect(() => {
    if (outrightState !== null && prevOutrightState.current !== outrightState) router.refresh();
    prevOutrightState.current = outrightState;
  }, [outrightState, router]);

  const oddsLogs     = initialLogs.filter((l) => l.type === "odds").slice(0, 10);
  const resultsLogs  = initialLogs.filter((l) => l.type === "results").slice(0, 10);
  const outrightLogs = initialLogs.filter((l) => l.type === "outrights").slice(0, 10);
  const latestOdds     = oddsLogs[0] ?? null;
  const latestResults  = resultsLogs[0] ?? null;
  const latestOutright = outrightLogs[0] ?? null;

  const oddsStale = !latestOdds || Date.now() - new Date(latestOdds.ran_at).getTime() > STALE_CUTOFF_MS;
  const resultsStale = !latestResults || Date.now() - new Date(latestResults.ran_at).getTime() > STALE_CUTOFF_MS;
  const showStaleWarn = oddsStale || resultsStale;

  const allLogs = [...oddsLogs, ...resultsLogs, ...outrightLogs].sort(
    (a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime()
  );

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Sync & Status</h2>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">

        {/* Stale warning */}
        {showStaleWarn && (
          <div className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 px-4 py-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-white">!</span>
            <div className="text-xs text-amber-900">
              <p className="font-semibold">Ingen sync de senaste 25 timmarna</p>
              <p className="mt-0.5 text-amber-700">
                {[oddsStale && "Odds", resultsStale && "Resultat"].filter(Boolean).join(" och ")}{" "}
                har inte synkats. Kontrollera att Vercel Cron är aktivt.
              </p>
            </div>
          </div>
        )}

        {/* Odds row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">Odds — The Odds API</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {latestOdds ? (
                <>
                  <span className={oddsStale ? "font-semibold text-[var(--loss)]" : "font-semibold text-[var(--win)]"}>
                    {timeAgo(latestOdds.ran_at)}
                  </span>
                  {" · "}
                  {latestOdds.updated} uppdaterade
                  {latestOdds.errors.length > 0 && (
                    <span className="ml-1 text-[var(--loss)]">· {latestOdds.errors.length} fel</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Aldrig synkad</span>
              )}
            </p>
            {oddsState && <div className="mt-1"><Feedback state={oddsState} /></div>}
          </div>
          <form action={oddsAction}>
            <SyncButton label="Kör odds-sync" />
          </form>
        </div>

        {/* Results row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">Resultat — football-data.org</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {latestResults ? (
                <>
                  <span className={resultsStale ? "font-semibold text-[var(--loss)]" : "font-semibold text-[var(--win)]"}>
                    {timeAgo(latestResults.ran_at)}
                  </span>
                  {" · "}
                  {latestResults.updated} uppdaterade
                  {latestResults.errors.length > 0 && (
                    <span className="ml-1 text-[var(--loss)]">· {latestResults.errors.length} fel</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Aldrig synkad</span>
              )}
            </p>
            {resultsState && <div className="mt-1"><Feedback state={resultsState} /></div>}
          </div>
          <form action={resultsAction}>
            <SyncButton label="Kör resultat-sync" />
          </form>
        </div>

        {/* Outrights row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">Specialbet — VM-vinnare &amp; skyttekung</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {latestOutright ? (
                <>
                  <span className="font-semibold text-[var(--win)]">
                    {timeAgo(latestOutright.ran_at)}
                  </span>
                  {" · "}
                  {latestOutright.updated} odds uppdaterade
                  {latestOutright.errors.length > 0 && (
                    <span className="ml-1 text-[var(--loss)]">· {latestOutright.errors.length} fel</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Aldrig synkad</span>
              )}
            </p>
            {outrightState && <div className="mt-1"><Feedback state={outrightState} /></div>}
          </div>
          <form action={outrightAction}>
            <SyncButton label="Kör specialbet-sync" />
          </form>
        </div>

        {/* History */}
        {allLogs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Inga körningar loggade ännu.
          </p>
        ) : (
          <>
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Historik</span>
            </div>
            {/* Header */}
            <div className="grid grid-cols-[72px_1fr_44px_44px_32px_64px] gap-x-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <span>Typ</span>
              <span>Tid</span>
              <span className="text-right">Hämtade</span>
              <span className="text-right">Uppdaterade</span>
              <span className="text-right">Fel</span>
              <span className="text-right">Varaktighet</span>
            </div>

            {allLogs.map((log) => {
              const hasErrors = log.errors.length > 0;
              const isExpanded = expandedIds.has(log.id);
              return (
                <div key={log.id} className="border-b border-gray-50 last:border-0">
                  <button
                    type="button"
                    onClick={() => hasErrors && toggleExpand(log.id)}
                    className={`grid w-full grid-cols-[72px_1fr_44px_44px_32px_64px] gap-x-2 px-4 py-2.5 text-xs text-left ${
                      hasErrors
                        ? "cursor-pointer bg-[var(--loss-50)] hover:bg-red-50"
                        : "cursor-default"
                    }`}
                  >
                    <span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        log.type === "odds"      ? "bg-[var(--primary-50)] text-[var(--primary)]" :
                        log.type === "outrights" ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {log.type === "odds" ? "Odds" : log.type === "outrights" ? "Specialbet" : "Resultat"}
                      </span>
                    </span>
                    <span className="text-gray-700 tabular-nums">{fmtTime(log.ran_at)}</span>
                    <span className="text-right tabular-nums text-gray-600">{log.processed}</span>
                    <span className={`text-right tabular-nums font-semibold ${
                      log.updated > 0 ? "text-[var(--win)]" : "text-gray-400"
                    }`}>
                      {log.updated}
                    </span>
                    <span className={`text-right tabular-nums font-semibold ${
                      hasErrors ? "text-[var(--loss)]" : "text-gray-400"
                    }`}>
                      {log.errors.length}
                      {hasErrors && (
                        <span className="ml-0.5 text-[9px]">{isExpanded ? "▲" : "▼"}</span>
                      )}
                    </span>
                    <span className="text-right tabular-nums text-gray-500">
                      {fmtDuration(log.duration_ms)}
                    </span>
                  </button>

                  {/* Expandable error details */}
                  {hasErrors && isExpanded && (
                    <div className="border-t border-red-100 bg-red-50 px-4 py-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">Feldetaljer</p>
                      <ul className="space-y-1">
                        {log.errors.map((err, i) => (
                          <li key={i} className="font-mono text-[11px] text-red-800 break-all">
                            {err}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
