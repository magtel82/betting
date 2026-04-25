import type { TeamStanding } from "@/lib/group-standings";

interface Props {
  letter:    string;
  standings: TeamStanding[];
}

function gdLabel(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

export function GroupTable({ letter, standings }: Props) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Grupp {letter}
      </h2>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Header */}
        <div
          className="grid items-center border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400"
          style={{ gridTemplateColumns: "20px 1fr 28px 28px 28px 28px 36px 28px 32px" }}
        >
          <span className="text-center">#</span>
          <span>Lag</span>
          <span className="text-center">S</span>
          <span className="text-center">V</span>
          <span className="text-center">O</span>
          <span className="text-center">F</span>
          <span className="text-center">GD</span>
          <span className="text-center">GM</span>
          <span className="text-center font-semibold text-gray-600">P</span>
        </div>

        {/* Rows */}
        {standings.map((s, i) => {
          const isTop2      = i < 2;
          // After position 2: slightly more visible cutoff line
          const borderCls   = i === 1
            ? "border-b-2 border-blue-100"
            : i < standings.length - 1
              ? "border-b border-gray-100"
              : "";
          // Non-qualifying rows get a very subtle different background
          const bgCls       = isTop2 ? "bg-white" : "bg-gray-50/60";
          // Left accent bar for qualified rows
          const leftAccent  = isTop2 ? "border-l-2 border-blue-400" : "border-l-2 border-transparent";

          return (
            <div
              key={s.teamId}
              className={`grid items-center px-3 py-2 text-sm tabular-nums ${borderCls} ${bgCls} ${leftAccent}`}
              style={{ gridTemplateColumns: "20px 1fr 28px 28px 28px 28px 36px 28px 32px" }}
            >
              {/* Position */}
              <span className={`text-center text-xs font-medium ${isTop2 ? "text-blue-600" : "text-gray-400"}`}>
                {i + 1}
              </span>

              {/* Team */}
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-base leading-none shrink-0">{s.flag ?? "🏳"}</span>
                <span className="truncate text-xs font-medium text-gray-900">{s.shortName}</span>
              </span>

              {/* Stats */}
              <span className="text-center text-xs text-gray-600">{s.played}</span>
              <span className="text-center text-xs text-gray-600">{s.won}</span>
              <span className="text-center text-xs text-gray-600">{s.drawn}</span>
              <span className="text-center text-xs text-gray-600">{s.lost}</span>
              <span className={`text-center text-xs font-medium ${s.gd > 0 ? "text-green-600" : s.gd < 0 ? "text-red-500" : "text-gray-500"}`}>
                {gdLabel(s.gd)}
              </span>
              <span className="text-center text-xs text-gray-600">{s.gf}</span>
              <span className="text-center text-xs font-bold text-gray-900">{s.points}</span>
            </div>
          );
        })}

        {standings.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-gray-400">
            Inga lag i denna grupp.
          </p>
        )}
      </div>
    </section>
  );
}
