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
};

function buildPlayerData(members: MemberRow[], slips: SlipRow[], fees: FeeRow[]): PlayerData[] {
  const byMember   = new Map<string, SlipRow[]>();
  const feeCounts  = new Map<string, number>();
  const feeAmounts = new Map<string, number>();

  for (const m of members) byMember.set(m.id, []);
  for (const s of slips)   byMember.get(s.league_member_id)?.push(s);
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

  const { data: rawMembers } = await supabase
    .from("league_members")
    .select("id, user_id, profile:profiles(display_name, email)")
    .eq("league_id", member.league_id as string)
    .eq("is_active", true);

  const members   = (rawMembers ?? []) as unknown as MemberRow[];
  const memberIds = members.map((m) => m.id);

  const [slipsRes, feesRes] = await Promise.all([
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
  ]);

  const players = buildPlayerData(
    members,
    (slipsRes.data ?? []) as unknown as SlipRow[],
    (feesRes.data  ?? []) as unknown as FeeRow[],
  );

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
