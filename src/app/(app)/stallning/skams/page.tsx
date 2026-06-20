import { requireActiveUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/nav/TopBar";
import { StallningTabs } from "../_components/StallningTabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileRow = { display_name: string; email: string | null };
type MemberRow  = { id: string; user_id: string; profile: ProfileRow | ProfileRow[] | null };
type SlipRow    = {
  id: string;
  league_member_id: string;
  stake: number;
  combined_odds: number;
  final_odds: number | null;
  status: "won" | "lost" | "cancelled";
  settled_at: string | null;
};
type FeeRow = { league_member_id: string; amount: number };

type Stat = { names: string[]; value: string; detail?: string } | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toStockholmDate(utc: string) {
  return new Date(utc).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

// ─── Name helper ──────────────────────────────────────────────────────────────

function memberName(profile: ProfileRow | ProfileRow[] | null): string {
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
  if (!p) return "Okänd";
  const raw = p.display_name;
  if (raw && !raw.includes("@")) return raw;
  const prefix = p.email?.split("@")[0];
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Okänd";
}

// ─── Per-player aggregates ────────────────────────────────────────────────────

type PlayerData = {
  id: string;
  name: string;
  // fees & cancels
  feeCount: number;
  feeTotal: number;
  cancelCount: number;
  // settled slip counts
  settledCount: number;
  wonCount: number;
  lostCount: number;
  // rates
  roi: number | null;
  winRate: number | null;
  avgOdds: number | null;
  // streaks
  winStreak: number;
  loseStreak: number;
  // loss metrics
  biggestLostStake: number;
  lowestLostOdds: number;    // Infinity if no lost slips
  highestLostOdds: number;   // 0 if no lost slips
  // win metrics
  biggestWonPayout: number;  // 0 if no won slips
  highestWonOdds: number;    // 0 if no won slips
  lowestWonOdds: number;     // Infinity if no won slips
  // stake metrics (non-cancelled slips)
  maxStake: number;          // 0 if no slips
  minStake: number;          // Infinity if no slips
  avgStake: number | null;   // null if no slips
  stakeCount: number;
};

type StakeRow = { league_member_id: string; stake: number };

function buildPlayerData(members: MemberRow[], slips: SlipRow[], fees: FeeRow[], stakeRows: StakeRow[]): PlayerData[] {
  const byMember   = new Map<string, SlipRow[]>();
  const feeCounts  = new Map<string, number>();
  const feeAmounts = new Map<string, number>();
  const stakes     = new Map<string, number[]>();

  for (const m of members) { byMember.set(m.id, []); stakes.set(m.id, []); }
  for (const s of slips)   byMember.get(s.league_member_id)?.push(s);
  for (const r of stakeRows) stakes.get(r.league_member_id)?.push(r.stake);
  for (const f of fees) {
    feeCounts.set(f.league_member_id,  (feeCounts.get(f.league_member_id)  ?? 0) + 1);
    feeAmounts.set(f.league_member_id, (feeAmounts.get(f.league_member_id) ?? 0) + Math.abs(f.amount));
  }

  return members.map((m) => {
    const name = memberName(m.profile);
    const all  = byMember.get(m.id) ?? [];

    const settled = all
      .filter((s) => s.status === "won" || s.status === "lost")
      .sort((a, b) => new Date(a.settled_at ?? 0).getTime() - new Date(b.settled_at ?? 0).getTime());
    const won       = settled.filter((s) => s.status === "won");
    const lost      = settled.filter((s) => s.status === "lost");
    const cancelled = all.filter((s) => s.status === "cancelled");

    const totalStaked = settled.reduce((s, r) => s + r.stake, 0);
    const totalPayout = won.reduce((s, r) => s + Math.floor(r.stake * (r.final_odds ?? r.combined_odds)), 0);

    const myStakes  = stakes.get(m.id) ?? [];
    const stakeSum  = myStakes.reduce((a, b) => a + b, 0);

    // Streaks
    let winStreak = 0, loseStreak = 0, curW = 0, curL = 0;
    for (const s of settled) {
      if (s.status === "won")  { curW++; curL = 0; if (curW > winStreak)  winStreak  = curW; }
      else                     { curL++; curW = 0; if (curL > loseStreak) loseStreak = curL; }
    }

    return {
      id: m.id, name,
      feeCount:  feeCounts.get(m.id)  ?? 0,
      feeTotal:  feeAmounts.get(m.id) ?? 0,
      cancelCount: cancelled.length,
      settledCount: settled.length,
      wonCount:  won.length,
      lostCount: lost.length,
      roi:      totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : null,
      winRate:  settled.length > 0 ? (won.length / settled.length) * 100 : null,
      avgOdds:  settled.length > 0 ? settled.reduce((s, r) => s + r.combined_odds, 0) / settled.length : null,
      winStreak, loseStreak,
      biggestLostStake: lost.reduce((max, r) => Math.max(max, r.stake), 0),
      lowestLostOdds:   lost.reduce((min, r) => Math.min(min, r.combined_odds), Infinity),
      highestLostOdds:  lost.reduce((max, r) => Math.max(max, r.combined_odds), 0),
      biggestWonPayout: won.reduce((max, r) => Math.max(max, Math.floor(r.stake * (r.final_odds ?? r.combined_odds))), 0),
      highestWonOdds:   won.reduce((max, r) => Math.max(max, r.combined_odds), 0),
      lowestWonOdds:    won.reduce((min, r) => Math.min(min, r.combined_odds), Infinity),
      maxStake:   myStakes.length ? Math.max(...myStakes) : 0,
      minStake:   myStakes.length ? Math.min(...myStakes) : Infinity,
      avgStake:   myStakes.length ? stakeSum / myStakes.length : null,
      stakeCount: myStakes.length,
    };
  });
}

// ─── Tied-winner helper ───────────────────────────────────────────────────────

function stat(
  players: PlayerData[],
  filter: (p: PlayerData) => boolean,
  metric: (p: PlayerData) => number,
  direction: "min" | "max",
  format: (score: number, first: PlayerData) => { value: string; detail?: string },
): Stat {
  const eligible = players.filter(filter);
  if (eligible.length === 0) return null;
  const scores = eligible.map((p) => ({ p, score: metric(p) }));
  const best   = direction === "max"
    ? Math.max(...scores.map((s) => s.score))
    : Math.min(...scores.map((s) => s.score));
  const tied = scores.filter((s) => s.score === best).map((s) => s.p);
  const { value, detail } = format(best, tied[0]);
  return { names: tied.map((p) => p.name), value, detail };
}

// ─── Category definitions ─────────────────────────────────────────────────────

function buildCategories(players: PlayerData[]) {
  const honor: { emoji: string; title: string; description: string; stat: Stat }[] = [
    {
      emoji: "📈",
      title: "Bäst ROI",
      description: "Bäst avkastning på insatser",
      stat: stat(players, (p) => p.roi !== null, (p) => p.roi!, "max",
        (v) => ({ value: `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` })),
    },
    {
      emoji: "💰",
      title: "Bästa bet",
      description: "Högsta utbetalning på ett enskilt slip",
      stat: stat(players, (p) => p.biggestWonPayout > 0, (p) => p.biggestWonPayout, "max",
        (v) => ({ value: `+${v.toLocaleString("sv-SE")} coins` })),
    },
    {
      emoji: "🔥",
      title: "Längsta vinnarserie",
      description: "Flest vinster i rad",
      stat: stat(players, (p) => p.winStreak >= 2, (p) => p.winStreak, "max",
        (v) => ({ value: `${v} i rad` })),
    },
    {
      emoji: "🎯",
      title: "Vågad & rätt",
      description: "Högst odds på ett vunnet slip — tog chansen",
      stat: stat(players, (p) => p.highestWonOdds > 0, (p) => p.highestWonOdds, "max",
        (v) => ({ value: `${v.toFixed(2)}x`, detail: "och vann!" })),
    },
    {
      emoji: "😎",
      title: "Bäst vinstprocent",
      description: "Vinner mest — minst 3 slip krävs",
      stat: stat(players, (p) => p.winRate !== null && p.settledCount >= 3, (p) => p.winRate!, "max",
        (v, p) => ({ value: `${v.toFixed(0)}% vunna`, detail: `${p.wonCount} av ${p.settledCount} slip` })),
    },
    {
      emoji: "🧠",
      title: "Säkrast & rätt",
      description: "Lägst odds på ett vunnet slip — kallt huvud",
      stat: stat(players, (p) => p.lowestWonOdds < Infinity, (p) => p.lowestWonOdds, "min",
        (v) => ({ value: `${v.toFixed(2)}x`, detail: "vann ändå" })),
    },
    {
      emoji: "🦁",
      title: "Högrollern",
      description: "Högst snittinsats — vågar satsa stort",
      stat: stat(players, (p) => p.avgStake !== null && p.stakeCount >= 2, (p) => p.avgStake!, "max",
        (v, p) => ({ value: `${Math.round(v).toLocaleString("sv-SE")} coins`, detail: `snitt över ${p.stakeCount} slip` })),
    },
  ];

  const shame: { emoji: string; title: string; description: string; stat: Stat }[] = [
    {
      emoji: "🥱",
      title: "Flest avgifter",
      description: "Glömde betta flest gånger",
      stat: stat(players, (p) => p.feeCount > 0, (p) => p.feeCount, "max",
        (v, p) => ({ value: `${v} avgifter`, detail: `−${p.feeTotal.toLocaleString("sv-SE")} coins totalt` })),
    },
    {
      emoji: "🔁",
      title: "Ångerbuk",
      description: "Flest annullerade slip",
      stat: stat(players, (p) => p.cancelCount > 0, (p) => p.cancelCount, "max",
        (v) => ({ value: `${v} annulleringar` })),
    },
    {
      emoji: "📉",
      title: "Sämst ROI",
      description: "Sämst avkastning på insatser",
      stat: stat(players, (p) => p.roi !== null, (p) => p.roi!, "min",
        (v) => ({ value: `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` })),
    },
    {
      emoji: "😩",
      title: "Sämst vinstprocent",
      description: "Förlorar mest — minst 3 slip krävs",
      stat: stat(players, (p) => p.winRate !== null && p.settledCount >= 3, (p) => p.winRate!, "min",
        (v, p) => ({ value: `${v.toFixed(0)}% vunna`, detail: `${p.wonCount} av ${p.settledCount} slip` })),
    },
    {
      emoji: "💸",
      title: "Dyraste miss",
      description: "Störst insats på ett enda förlorat slip",
      stat: stat(players, (p) => p.biggestLostStake > 0, (p) => p.biggestLostStake, "max",
        (v) => ({ value: `−${v.toLocaleString("sv-SE")} coins` })),
    },
    {
      emoji: "🐢",
      title: "Saftigast",
      description: "Lägst snittodds — tar aldrig risker",
      stat: stat(players, (p) => p.avgOdds !== null && p.settledCount >= 2, (p) => p.avgOdds!, "min",
        (v, p) => ({ value: `${v.toFixed(2)}x snittodds`, detail: `${p.settledCount} avgjorda slip` })),
    },
    {
      emoji: "🤦",
      title: "Förlorade på favorit",
      description: "Lägst odds på ett förlorat slip",
      stat: stat(players, (p) => p.lowestLostOdds < Infinity, (p) => p.lowestLostOdds, "min",
        (v) => ({ value: `${v.toFixed(2)}x`, detail: "lägst odds på ett förlorat slip" })),
    },
    {
      emoji: "🎲",
      title: "Stor risk, inget resultat",
      description: "Högst odds på ett förlorat slip",
      stat: stat(players, (p) => p.highestLostOdds > 0, (p) => p.highestLostOdds, "max",
        (v) => ({ value: `${v.toFixed(2)}x`, detail: "högst odds på ett förlorat slip" })),
    },
    {
      emoji: "❌",
      title: "Längsta förlorarserie",
      description: "Flest förluster i rad",
      stat: stat(players, (p) => p.loseStreak >= 2, (p) => p.loseStreak, "max",
        (v) => ({ value: `${v} i rad` })),
    },
    {
      emoji: "🐔",
      title: "Fegis",
      description: "Lägst snittinsats — vågar aldrig satsa stort",
      stat: stat(players, (p) => p.avgStake !== null && p.stakeCount >= 2, (p) => p.avgStake!, "min",
        (v, p) => ({ value: `${Math.round(v).toLocaleString("sv-SE")} coins`, detail: `snitt över ${p.stakeCount} slip` })),
    },
  ];

  return { honor, shame };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SkamsPage() {
  const { supabase, user } = await requireActiveUser();
  const admin = createAdminClient();

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

  const [rawMembersRes, leagueRes] = await Promise.all([
    supabase
      .from("league_members")
      .select("id, user_id, profile:profiles(display_name, email)")
      .eq("league_id", member.league_id as string)
      .eq("is_active", true),
    supabase
      .from("leagues")
      .select("tournament_id")
      .eq("id", member.league_id as string)
      .single(),
  ]);

  const members     = (rawMembersRes.data ?? []) as unknown as MemberRow[];
  const memberIds   = members.map((m) => m.id);
  const tournamentId = leagueRes.data?.tournament_id as string | undefined;

  const now           = new Date().toISOString();
  const todayStockholm = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

  const [slipsRes, feesRes, pastMatchesRes, activeSlipsRes] = await Promise.all([
    memberIds.length > 0
      ? admin.from("bet_slips")
          .select("id, league_member_id, stake, combined_odds, final_odds, status, settled_at")
          .in("league_member_id", memberIds)
          .in("status", ["won", "lost", "cancelled"])
      : { data: [] },
    memberIds.length > 0
      ? admin.from("match_wallet_transactions")
          .select("league_member_id, amount")
          .in("league_member_id", memberIds)
          .eq("type", "inactivity_fee")
      : { data: [] },
    tournamentId
      ? admin.from("matches")
          .select("id, scheduled_at")
          .eq("tournament_id", tournamentId)
          .neq("status", "void")
          .lt("scheduled_at", now)
      : { data: [] },
    memberIds.length > 0
      ? admin.from("bet_slips")
          .select("id, league_member_id, stake")
          .in("league_member_id", memberIds)
          .neq("status", "cancelled")
      : { data: [] },
  ]);

  // Selections for non-cancelled slips → derive covered dates per member
  const activeSlipIds = (activeSlipsRes.data ?? []).map((s) => (s as { id: string }).id);
  const { data: selectionsData } = activeSlipIds.length > 0
    ? await admin.from("bet_slip_selections").select("slip_id, match_id").in("slip_id", activeSlipIds)
    : { data: [] };

  // Build missed-days per member.
  // Only count days BEFORE today — same rule as the calendar summary.
  // A day is only "missed" once it's fully in the past; today might still have
  // matches going on and bets settling.
  const matchIdToDate = new Map<string, string>();
  const pastMatchDays = new Set<string>();
  for (const m of pastMatchesRes.data ?? []) {
    const d = toStockholmDate((m as { scheduled_at: string }).scheduled_at);
    matchIdToDate.set((m as { id: string }).id, d);
    if (d < todayStockholm) pastMatchDays.add(d);
  }

  const slipToMember = new Map<string, string>();
  for (const s of activeSlipsRes.data ?? []) {
    slipToMember.set((s as { id: string; league_member_id: string }).id, (s as { id: string; league_member_id: string }).league_member_id);
  }

  const coveredByMember = new Map<string, Set<string>>();
  for (const m of members) coveredByMember.set(m.id, new Set());
  for (const sel of selectionsData ?? []) {
    const s = sel as { slip_id: string; match_id: string };
    const mid = slipToMember.get(s.slip_id);
    const date = matchIdToDate.get(s.match_id);
    if (mid && date) coveredByMember.get(mid)?.add(date);
  }

  type MissedEntry = { name: string; missed: number };
  const missedEntries: MissedEntry[] = members
    .map((m) => ({
      name:   memberName(m.profile),
      missed: [...pastMatchDays].filter((d) => !coveredByMember.get(m.id)?.has(d)).length,
    }))
    .sort((a, b) => b.missed - a.missed);

  const totalPastDays = pastMatchDays.size;

  const players = buildPlayerData(
    members,
    (slipsRes.data ?? []) as unknown as SlipRow[],
    (feesRes.data  ?? []) as unknown as FeeRow[],
    (activeSlipsRes.data ?? []) as unknown as StakeRow[],
  );

  // Stake table rows (derived from players → shares one source with the cards)
  const stakeEntries = players
    .filter((p) => p.stakeCount > 0)
    .map((p) => ({
      name: p.name,
      max:  p.maxStake,
      min:  p.minStake === Infinity ? 0 : p.minStake,
      avg:  p.avgStake !== null ? Math.round(p.avgStake) : 0,
    }))
    .sort((a, b) => b.avg - a.avg);

  const { honor, shame } = buildCategories(players);

  return (
    <>
      <TopBar title="Ställning" />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">

        <StallningTabs />

        {/* ── Heder ─────────────────────────────────────────────────────────── */}
        <section>
          <div
            className="mb-3 flex items-center gap-2 rounded-xl px-4 py-3 text-white"
            style={{ background: "linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%)" }}
          >
            <span className="text-xl" aria-hidden>🏆</span>
            <div>
              <p className="font-bold">Heder</p>
              <p className="text-xs text-green-200">Turneringens bästa prestationer</p>
            </div>
          </div>
          <div className="space-y-2">
            {honor.map((cat) => (
              <StatCard key={cat.title} emoji={cat.emoji} title={cat.title}
                description={cat.description} stat={cat.stat} variant="honor" />
            ))}
          </div>
        </section>

        {/* ── Skäms ─────────────────────────────────────────────────────────── */}
        <section>
          <div
            className="mb-3 flex items-center gap-2 rounded-xl px-4 py-3 text-white"
            style={{ background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 60%, #991b1b 100%)" }}
          >
            <span className="text-xl" aria-hidden>💀</span>
            <div>
              <p className="font-bold">Skäms</p>
              <p className="text-xs text-red-200">Turneringens största skam</p>
            </div>
          </div>
          <div className="space-y-2">
            {shame.map((cat) => (
              <StatCard key={cat.title} emoji={cat.emoji} title={cat.title}
                description={cat.description} stat={cat.stat} variant="shame" />
            ))}
          </div>
        </section>

        {/* ── Insatser ──────────────────────────────────────────────────────── */}
        {stakeEntries.length > 0 && (
          <section>
            <div
              className="mb-3 flex items-center gap-2 rounded-xl px-4 py-3 text-white"
              style={{ background: "linear-gradient(135deg, #422006 0%, #854d0e 60%, #a16207 100%)" }}
            >
              <span className="text-xl" aria-hidden>💵</span>
              <div>
                <p className="font-bold">Insatser</p>
                <p className="text-xs text-amber-200">Högsta, lägsta och snittinsats per spelare</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <span>Spelare</span>
                <span className="w-14 text-right">Högst</span>
                <span className="w-14 text-right">Lägst</span>
                <span className="w-14 text-right text-gray-600">Snitt</span>
              </div>
              {/* Rows */}
              {stakeEntries.map((e, i) => (
                <div
                  key={e.name}
                  className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 ${
                    i < stakeEntries.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <span className="truncate text-sm font-medium text-gray-800">{e.name}</span>
                  <span className="w-14 text-right tabular-nums text-sm text-gray-500">{e.max.toLocaleString("sv-SE")}</span>
                  <span className="w-14 text-right tabular-nums text-sm text-gray-500">{e.min.toLocaleString("sv-SE")}</span>
                  <span className="w-14 text-right tabular-nums text-sm font-bold text-gray-900">{e.avg.toLocaleString("sv-SE")}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-400">
              Baseras på lagda slip (annullerade räknas inte). Belopp i coins 🪙
            </p>
          </section>
        )}

        {/* ── Missade matchdagar ────────────────────────────────────────────── */}
        {totalPastDays > 0 && (
          <section>
            <div
              className="mb-3 flex items-center gap-2 rounded-xl px-4 py-3 text-white"
              style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)" }}
            >
              <span className="text-xl" aria-hidden>📅</span>
              <div>
                <p className="font-bold">Missade matchdagar</p>
                <p className="text-xs text-indigo-200">Dagar med match utan aktivt bet</p>
              </div>
            </div>

            {missedEntries.every((e) => e.missed === 0) ? (
              <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 text-center shadow-sm">
                <p className="text-2xl">🎉</p>
                <p className="mt-1 text-sm font-semibold text-gray-800">Alla rena!</p>
                <p className="mt-0.5 text-xs text-gray-400">Ingen har missat en enda matchdag</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                {missedEntries.map((entry, i) => (
                  <div
                    key={entry.name}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      i < missedEntries.length - 1 ? "border-b border-gray-50" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-800">{entry.name}</span>
                    <span className={`tabular-nums text-sm font-bold ${
                      entry.missed === 0 ? "text-[var(--win)]" : "text-[var(--loss)]"
                    }`}>
                      {entry.missed === 0 ? "0 ✓" : `${entry.missed} av ${totalPastDays}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="pb-2 text-center text-[11px] text-gray-300">
          Statistik baseras på avgjorda matchslip.
        </p>

      </div>
    </>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  emoji, title, description, stat, variant,
}: {
  emoji: string;
  title: string;
  description: string;
  stat: Stat;
  variant: "honor" | "shame";
}) {
  const valueColor = variant === "honor" ? "text-[var(--win)]" : "text-[var(--loss)]";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50 px-4 py-2">
        <span className="text-base leading-none" aria-hidden>{emoji}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">{title}</p>
          <p className="truncate text-[11px] text-gray-400">{description}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {stat ? (
          <>
            <div className="min-w-0">
              {stat.names.map((name) => (
                <p key={name} className="truncate text-sm font-semibold text-gray-900">{name}</p>
              ))}
            </div>
            <div className="shrink-0 text-right">
              <p className={`tabular-nums text-sm font-bold ${valueColor}`}>{stat.value}</p>
              {stat.detail && <p className="text-[11px] text-gray-400">{stat.detail}</p>}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">— inga data än</p>
        )}
      </div>
    </div>
  );
}
