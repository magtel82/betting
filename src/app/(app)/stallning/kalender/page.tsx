import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { StallningTabs } from "../_components/StallningTabs";

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Januari","Februari","Mars","April","Maj","Juni",
  "Juli","Augusti","September","Oktober","November","December",
];
const DAY_LABELS = ["Mån","Tis","Ons","Tor","Fre","Lör","Sön"];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Monday = 1, Sunday = 7
function firstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 7 : d;
}

function toStockholmDate(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function KalenderPage() {
  const { supabase, user } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, league_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return (
      <>
        <TopBar title="Ställning" />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-gray-400">Du är inte med i någon liga.</p>
        </div>
      </>
    );
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("tournament_id")
    .eq("id", member.league_id as string)
    .single();

  const tournamentId = league?.tournament_id as string | undefined;

  // All non-void matches → derive match days
  const { data: rawMatches } = tournamentId
    ? await supabase
        .from("matches")
        .select("id, scheduled_at")
        .eq("tournament_id", tournamentId)
        .neq("status", "void")
        .order("scheduled_at")
    : { data: [] };

  const matches = rawMatches ?? [];

  // matchDays: date string → number of matches that day
  const matchDays = new Map<string, number>();
  for (const m of matches) {
    const d = toStockholmDate(m.scheduled_at as string);
    matchDays.set(d, (matchDays.get(d) ?? 0) + 1);
  }

  // User's non-cancelled slip IDs
  const { data: rawSlips } = await supabase
    .from("bet_slips")
    .select("id")
    .eq("league_member_id", member.id as string)
    .neq("status", "cancelled");

  const slipIds = (rawSlips ?? []).map((s) => (s as { id: string }).id);

  // Covered match IDs (from non-cancelled slips)
  const coveredMatchIds = new Set<string>();
  if (slipIds.length > 0) {
    const { data: rawSels } = await supabase
      .from("bet_slip_selections")
      .select("match_id")
      .in("slip_id", slipIds);
    for (const s of rawSels ?? []) {
      coveredMatchIds.add((s as { match_id: string }).match_id);
    }
  }

  // Map covered match IDs → covered dates
  const coveredDates = new Set<string>();
  for (const m of matches) {
    if (coveredMatchIds.has(m.id as string)) {
      coveredDates.add(toStockholmDate(m.scheduled_at as string));
    }
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

  // Count missed past match days for summary
  let missedCount = 0;
  let coveredCount = 0;
  for (const [date] of matchDays) {
    if (date >= today) continue;
    if (coveredDates.has(date)) coveredCount++;
    else missedCount++;
  }

  return (
    <>
      <TopBar title="Ställning" />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">

        <StallningTabs />

        {/* ── Summary ───────────────────────────────────────────────────────── */}
        {(coveredCount + missedCount) > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-black tabular-nums text-[var(--win)]">{coveredCount}</p>
              <p className="mt-0.5 text-xs text-gray-500">dagar med bet</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-black tabular-nums text-[var(--loss)]">{missedCount}</p>
              <p className="mt-0.5 text-xs text-gray-500">missade matchdagar</p>
            </div>
          </div>
        )}

        {/* ── Calendars ─────────────────────────────────────────────────────── */}
        {/* VM 2026: June 11 – July 19 → show June + July */}
        {[{ year: 2026, month: 5 }, { year: 2026, month: 6 }].map(({ year, month }) => (
          <MonthCalendar
            key={`${year}-${month}`}
            year={year}
            month={month}
            matchDays={matchDays}
            coveredDates={coveredDates}
            today={today}
          />
        ))}

        {/* ── Legend ────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
          <LegendItem color="bg-[var(--win)]"   label="Bet lagd" />
          <LegendItem color="bg-[var(--loss)]"  label="Ingen bet" />
          <LegendItem color="bg-[var(--primary-50)] ring-1 ring-[var(--primary)]" label="Kommande" />
        </div>

      </div>
    </>
  );
}

// ─── MonthCalendar ────────────────────────────────────────────────────────────

function MonthCalendar({
  year, month, matchDays, coveredDates, today,
}: {
  year: number;
  month: number;
  matchDays: Map<string, number>;
  coveredDates: Set<string>;
  today: string;
}) {
  const days    = daysInMonth(year, month);
  const padding = firstDayOfWeek(year, month) - 1;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="font-bold text-gray-900">{MONTH_NAMES[month]} {year}</h2>
      </div>
      <div className="p-3">
        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {DAY_LABELS.map((l) => (
            <div key={l} className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {l}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: padding }, (_, i) => <div key={`p${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const day     = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isMatch   = matchDays.has(dateStr);
            const covered   = coveredDates.has(dateStr);
            const isPast    = dateStr < today;
            const isToday   = dateStr === today;
            const count     = matchDays.get(dateStr) ?? 0;

            let bg   = "";
            let text = "text-gray-300";

            if (isMatch) {
              if (isPast) {
                bg   = covered ? "bg-[var(--win)]" : "bg-[var(--loss)]";
                text = "text-white font-bold";
              } else {
                bg   = "bg-[var(--primary-50)] ring-1 ring-[var(--primary)]";
                text = isToday
                  ? "text-[var(--primary)] font-black"
                  : "text-[var(--primary)] font-bold";
              }
            }

            return (
              <div
                key={day}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-lg ${bg}`}
              >
                <span className={`text-sm leading-none ${text}`}>{day}</span>
                {isMatch && count > 1 && (
                  <span className={`mt-0.5 text-[9px] leading-none ${
                    isPast ? "text-white/75" : "text-[var(--primary)]/70"
                  }`}>
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── LegendItem ───────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
