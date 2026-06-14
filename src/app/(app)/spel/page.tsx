import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { PenaltyGame } from "./_components/PenaltyGame";

// Unlisted on purpose — reachable by URL (/spel) but not linked anywhere yet.
export const metadata = { title: "Straffspel" };

type ProfileRow = { display_name: string; email: string | null };
type MemberRow  = { id: string; user_id: string; profile: ProfileRow | ProfileRow[] | null };

function memberName(profile: ProfileRow | ProfileRow[] | null): string {
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
  if (!p) return "Okänd";
  const raw = p.display_name;
  if (raw && !raw.includes("@")) return raw;
  const prefix = p.email?.split("@")[0];
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Okänd";
}

type PlayerStat = { member_id: string; best: number; worst: number; games: number };
type DayEntry   = { member_id: string; score: number } | null;
type Overview   = { players: PlayerStat[]; today_best: DayEntry; today_worst: DayEntry };

type Row = { memberId: string; name: string; value: number; isMe: boolean };

export default async function SpelPage() {
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
        <TopBar title="Straffspel" />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-gray-400">Du är inte med i någon liga ännu.</p>
        </div>
      </>
    );
  }

  const [overviewRes, membersRes] = await Promise.all([
    supabase.rpc("get_penalty_overview", { p_league_id: member.league_id }),
    supabase
      .from("league_members")
      .select("id, user_id, profile:profiles(display_name, email)")
      .eq("league_id", member.league_id as string)
      .eq("is_active", true),
  ]);

  const members  = (membersRes.data ?? []) as unknown as MemberRow[];
  const nameById = new Map(members.map((m) => [m.id, memberName(m.profile)]));

  const overview = (overviewRes.data ?? { players: [], today_best: null, today_worst: null }) as Overview;
  const players  = overview.players ?? [];

  const topTotal: Row[] = players
    .map((p) => ({ memberId: p.member_id, name: nameById.get(p.member_id) ?? "Okänd", value: p.best, isMe: p.member_id === member.id }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "sv"));

  const worstTotal: Row[] = players
    .map((p) => ({ memberId: p.member_id, name: nameById.get(p.member_id) ?? "Okänd", value: p.worst, isMe: p.member_id === member.id }))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name, "sv"));

  const dayEntry = (e: DayEntry) =>
    e ? { name: nameById.get(e.member_id) ?? "Okänd", score: e.score, isMe: e.member_id === member.id } : null;
  const todayBest  = dayEntry(overview.today_best);
  const todayWorst = dayEntry(overview.today_worst);

  return (
    <>
      <TopBar title="Straffspel" />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
        <PenaltyGame />

        {/* ── Dagens bästa / sämsta ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <DayCard label="Dagens bästa" emoji="☀️" entry={todayBest} tone="good" />
          <DayCard label="Dagens sämsta" emoji="💀" entry={todayWorst} tone="bad" />
        </div>

        {/* ── Topplista totalt ───────────────────────────────────────────────── */}
        <StatList title="🏆 Topplista totalt" rows={topTotal} medals empty="Ingen har spelat ännu" />

        {/* ── Sämst totalt ───────────────────────────────────────────────────── */}
        <StatList title="💩 Sämst totalt" rows={worstTotal} empty="Ingen har spelat ännu" muted />
      </div>
    </>
  );
}

// ─── Day highlight card ─────────────────────────────────────────────────────────
function DayCard({ label, emoji, entry, tone }: {
  label: string; emoji: string; entry: { name: string; score: number; isMe: boolean } | null; tone: "good" | "bad";
}) {
  const color = tone === "good" ? "text-[var(--win)]" : "text-[var(--loss)]";
  return (
    <div className="rounded-xl border-2 border-gray-900 bg-white px-3 py-2.5 shadow-[3px_3px_0_0_#111827]">
      <p className="font-mono text-[10px] font-black uppercase tracking-widest text-gray-400">{emoji} {label}</p>
      {entry ? (
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm font-bold ${entry.isMe ? "text-[var(--primary-600)]" : "text-gray-900"}`}>{entry.name}</span>
          <span className={`font-mono text-lg font-black tabular-nums ${color}`}>{entry.score}</span>
        </div>
      ) : (
        <p className="mt-1 text-sm font-medium text-gray-400">—</p>
      )}
    </div>
  );
}

// ─── Stat list ──────────────────────────────────────────────────────────────────
function StatList({ title, rows, empty, medals, muted }: {
  title: string; rows: Row[]; empty: string; medals?: boolean; muted?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-xs font-black uppercase tracking-widest text-gray-500">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white py-6 text-center">
          <p className="text-sm font-medium text-gray-600">{empty}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-gray-900 bg-white shadow-[3px_3px_0_0_#111827]">
          {rows.map((row, i) => (
            <div key={row.memberId}
                 className={`flex items-center gap-3 px-4 py-2.5 ${i < rows.length - 1 ? "border-b border-gray-100" : ""} ${row.isMe ? "bg-[var(--primary-50)]" : ""}`}>
              <span className="w-6 text-center font-mono text-sm font-black text-gray-400">
                {medals && i === 0 ? "🥇" : medals && i === 1 ? "🥈" : medals && i === 2 ? "🥉" : i + 1}
              </span>
              <span className={`flex-1 truncate text-sm ${row.isMe ? "font-bold text-[var(--primary-600)]" : "font-medium text-gray-900"}`}>
                {row.name}{row.isMe && <span className="ml-1.5 text-[10px] font-bold uppercase text-[var(--primary)]">du</span>}
              </span>
              <span className={`font-mono text-base font-black tabular-nums ${muted ? "text-gray-500" : "text-gray-900"}`}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
