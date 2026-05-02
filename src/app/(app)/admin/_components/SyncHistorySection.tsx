export type SyncLogRow = {
  id: number;
  type: "odds" | "results";
  ran_at: string;
  processed: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration_ms: number;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone:  "Europe/Stockholm",
    day:       "numeric",
    month:     "short",
    hour:      "2-digit",
    minute:    "2-digit",
  });
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function timeAgo(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 2)  return "just nu";
  if (diffMin < 60) return `${diffMin} min sedan`;
  const diffH = Math.round(diffMin / 60);
  if (diffH  < 24)  return `${diffH} h sedan`;
  return `${Math.round(diffH / 24)} d sedan`;
}

interface Props {
  logs: SyncLogRow[];
}

export function SyncHistorySection({ logs }: Props) {
  // Separate last 10 per type
  const oddsLogs    = logs.filter((l) => l.type === "odds").slice(0, 10);
  const resultsLogs = logs.filter((l) => l.type === "results").slice(0, 10);

  // For the "senast körde" indicator — most recent run of either type
  const latestOdds    = oddsLogs[0]    ?? null;
  const latestResults = resultsLogs[0] ?? null;
  const latestAny     = [latestOdds, latestResults]
    .filter(Boolean)
    .sort((a, b) => new Date(b!.ran_at).getTime() - new Date(a!.ran_at).getTime())[0] ?? null;

  const staleCutoffMs   = 25 * 60 * 60 * 1000;
  const oddsStale       = !latestOdds    || Date.now() - new Date(latestOdds.ran_at).getTime()    > staleCutoffMs;
  const resultsStale    = !latestResults || Date.now() - new Date(latestResults.ran_at).getTime() > staleCutoffMs;
  const showStaleWarn   = oddsStale || resultsStale;

  const allLogs = [...oddsLogs, ...resultsLogs].sort(
    (a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime()
  );

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Sync-historik</h2>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">

        {/* Status-rad */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span>
              Odds:{" "}
              <span className={latestOdds ? (oddsStale ? "text-[var(--loss)] font-semibold" : "text-[var(--win)] font-semibold") : "text-gray-400"}>
                {latestOdds ? timeAgo(latestOdds.ran_at) : "aldrig"}
              </span>
            </span>
            <span>
              Resultat:{" "}
              <span className={latestResults ? (resultsStale ? "text-[var(--loss)] font-semibold" : "text-[var(--win)] font-semibold") : "text-gray-400"}>
                {latestResults ? timeAgo(latestResults.ran_at) : "aldrig"}
              </span>
            </span>
          </div>
          {latestAny && (
            <span className="text-[11px] text-gray-400">
              Senaste körning: {timeAgo(latestAny.ran_at)}
            </span>
          )}
        </div>

        {/* Varning om cron missats */}
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

        {/* Tabell */}
        {allLogs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Inga körningar loggade ännu.
          </p>
        ) : (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-[80px_1fr_56px_56px_56px_72px] gap-x-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <span>Typ</span>
              <span>Tid</span>
              <span className="text-right">Hämtade</span>
              <span className="text-right">Uppdaterade</span>
              <span className="text-right">Fel</span>
              <span className="text-right">Varaktighet</span>
            </div>

            {allLogs.map((log) => {
              const hasErrors = log.errors.length > 0;
              return (
                <div
                  key={log.id}
                  className={`grid grid-cols-[80px_1fr_56px_56px_56px_72px] gap-x-3 border-b border-gray-50 px-4 py-2.5 text-xs last:border-0 ${
                    hasErrors ? "bg-[var(--loss-50)]" : ""
                  }`}
                >
                  {/* Typ-badge */}
                  <span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      log.type === "odds"
                        ? "bg-[var(--primary-50)] text-[var(--primary)]"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {log.type === "odds" ? "Odds" : "Resultat"}
                    </span>
                  </span>

                  {/* Tid */}
                  <span className="text-gray-700 tabular-nums">{fmtTime(log.ran_at)}</span>

                  {/* Hämtade */}
                  <span className="text-right tabular-nums text-gray-600">{log.processed}</span>

                  {/* Uppdaterade */}
                  <span className={`text-right tabular-nums font-semibold ${
                    log.updated > 0 ? "text-[var(--win)]" : "text-gray-400"
                  }`}>
                    {log.updated}
                  </span>

                  {/* Fel */}
                  <span className={`text-right tabular-nums font-semibold ${
                    hasErrors ? "text-[var(--loss)]" : "text-gray-400"
                  }`}>
                    {log.errors.length}
                  </span>

                  {/* Varaktighet */}
                  <span className="text-right tabular-nums text-gray-500">
                    {fmtDuration(log.duration_ms)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
