import { FlagIcon } from "@/components/FlagIcon";

export interface GroupMatch {
  id:          string;
  status:      string;
  homeFlag:    string | null;
  homeName:    string;
  awayFlag:    string | null;
  awayName:    string;
  homeScore:   number | null;
  awayScore:   number | null;
  scheduledAt: string;
}

function swDateTime(utc: string) {
  return new Date(utc).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    day:      "numeric",
    month:    "short",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

interface Props {
  matches: GroupMatch[];
}

export function GroupMatches({ matches }: Props) {
  if (matches.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-sm text-gray-400">
        Inga matcher i denna grupp.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {matches.map((m, i) => {
        const isFinished = m.status === "finished";
        const isLive     = m.status === "live";
        const hasScore   = m.homeScore !== null && m.awayScore !== null;
        const border     = i < matches.length - 1 ? "border-b border-gray-100" : "";

        return (
          <div
            key={m.id}
            className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 ${border} ${isFinished ? "bg-gray-50/60" : ""}`}
          >
            {/* Home team — right-aligned toward the score */}
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <span className="truncate text-xs font-medium text-gray-900">{m.homeName}</span>
              <FlagIcon code={m.homeFlag} label={m.homeName} className="shrink-0 text-base" />
            </div>

            {/* Score / time */}
            <div className="flex shrink-0 flex-col items-center">
              {hasScore ? (
                <span className="text-sm font-bold tabular-nums text-gray-900">
                  {m.homeScore}&thinsp;–&thinsp;{m.awayScore}
                </span>
              ) : (
                <span className="text-xs text-gray-300">–</span>
              )}
              {isLive ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--win)]">
                  <span className="inline-block h-1 w-1 rounded-full bg-[var(--win)] animate-pulse" />
                  Pågår
                </span>
              ) : !isFinished ? (
                <span className="text-[10px] text-gray-400">{swDateTime(m.scheduledAt)}</span>
              ) : null}
            </div>

            {/* Away team — left-aligned away from the score */}
            <div className="flex min-w-0 items-center gap-1.5">
              <FlagIcon code={m.awayFlag} label={m.awayName} className="shrink-0 text-base" />
              <span className="truncate text-xs font-medium text-gray-900">{m.awayName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
