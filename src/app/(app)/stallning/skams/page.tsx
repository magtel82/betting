import { requireActiveUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/nav/TopBar";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileRow = { display_name: string; email: string | null };

type MemberRow = {
  id: string;
  user_id: string;
  profile: ProfileRow | ProfileRow[] | null;
};

type SlipRow = {
  id: string;
  league_member_id: string;
  stake: number;
  combined_odds: number;
  final_odds: number | null;
  status: "won" | "lost" | "cancelled";
  settled_at: string | null;
  placed_at: string;
};

type FeeRow = {
  league_member_id: string;
  amount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberName(profile: ProfileRow | ProfileRow[] | null): string {
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
  if (!p) return "Okänd";
  const raw = p.display_name;
  if (raw && !raw.includes("@")) return raw;
  const prefix = p.email?.split("@")[0];
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Okänd";
}

// ─── Stats ────────────────────────────────────────────────────────────────────

type ShameWinner = { name: string; value: string; detail?: string } | null;

type ShameStats = {
  feeCount:     ShameWinner;  // flest inaktivitetsavgifter
  cancelCount:  ShameWinner;  // flest annullerade slip
  worstRoi:     ShameWinner;  // sämst ROI
  worstWinRate: ShameWinner;  // sämst vinstprocent
  biggestLoss:  ShameWinner;  // dyraste enskilda förlust
  mostDefensive:ShameWinner;  // lägst snittodds (saftigast)
  favouriteFail:ShameWinner;  // förlorade slip med lägst kombinations-odds
  biggestRisk:  ShameWinner;  // högst odds på ett förlorat slip
  loseStreak:   ShameWinner;  // längsta förlorarserie
};

function computeShame(
  members: MemberRow[],
  slips: SlipRow[],
  fees: FeeRow[],
): ShameStats {
  // Group by member
  const byMember = new Map<string, SlipRow[]>();
  for (const m of members) byMember.set(m.id, []);
  for (const s of slips) byMember.get(s.league_member_id)?.push(s);

  const feeCounts = new Map<string, number>();
  const feeAmounts = new Map<string, number>();
  for (const f of fees) {
    feeCounts.set(f.league_member_id, (feeCounts.get(f.league_member_id) ?? 0) + 1);
    feeAmounts.set(f.league_member_id, (feeAmounts.get(f.league_member_id) ?? 0) + Math.abs(f.amount));
  }

  // Per-player stats
  type PlayerData = {
    id: string;
    name: string;
    feeCount: number;
    feeTotal: number;
    cancelCount: number;
    settled: SlipRow[];
    lost: SlipRow[];
    won: SlipRow[];
    roi: number | null;
    winRate: number | null;
    avgOdds: number | null;
    biggestLostStake: number;
    lowestLostOdds: number;
    highestLostOdds: number;
    loseStreak: number;
  };

  const players: PlayerData[] = members.map((m) => {
    const name = memberName(m.profile);
    const all = byMember.get(m.id) ?? [];
    const settled = all.filter((s) => s.status === "won" || s.status === "lost")
      .sort((a, b) => new Date(a.settled_at ?? 0).getTime() - new Date(b.settled_at ?? 0).getTime());
    const lost = settled.filter((s) => s.status === "lost");
    const won  = settled.filter((s) => s.status === "won");
    const cancelled = all.filter((s) => s.status === "cancelled");

    const totalStaked = settled.reduce((s, r) => s + r.stake, 0);
    const totalPayout = won.reduce((s, r) => s + Math.floor(r.stake * (r.final_odds ?? r.combined_odds)), 0);
    const roi = totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : null;

    const winRate = settled.length > 0 ? (won.length / settled.length) * 100 : null;

    const avgOdds = settled.length > 0
      ? settled.reduce((s, r) => s + r.combined_odds, 0) / settled.length
      : null;

    const biggestLostStake = lost.reduce((max, r) => Math.max(max, r.stake), 0);
    const lowestLostOdds   = lost.reduce((min, r) => Math.min(min, r.combined_odds), Infinity);
    const highestLostOdds  = lost.reduce((max, r) => Math.max(max, r.combined_odds), 0);

    // Longest lose streak
    let maxStreak = 0, cur = 0;
    for (const s of settled) {
      if (s.status === "lost") { cur++; if (cur > maxStreak) maxStreak = cur; }
      else cur = 0;
    }

    return {
      id: m.id,
      name,
      feeCount:  feeCounts.get(m.id) ?? 0,
      feeTotal:  feeAmounts.get(m.id) ?? 0,
      cancelCount: cancelled.length,
      settled, lost, won,
      roi,
      winRate,
      avgOdds,
      biggestLostStake,
      lowestLostOdds,
      highestLostOdds,
      loseStreak: maxStreak,
    };
  });

  function winner<T>(
    arr: PlayerData[],
    filter: (p: PlayerData) => boolean,
    sort: (a: PlayerData, b: PlayerData) => number,
    toWinner: (p: PlayerData) => ShameWinner,
  ): ShameWinner {
    const eligible = arr.filter(filter).sort(sort);
    return eligible.length > 0 ? toWinner(eligible[0]) : null;
  }

  return {
    feeCount: winner(
      players,
      (p) => p.feeCount > 0,
      (a, b) => b.feeCount - a.feeCount,
      (p) => ({
        name: p.name,
        value: `${p.feeCount} avgifter`,
        detail: `−${p.feeTotal.toLocaleString("sv-SE")} coins totalt`,
      }),
    ),

    cancelCount: winner(
      players,
      (p) => p.cancelCount > 0,
      (a, b) => b.cancelCount - a.cancelCount,
      (p) => ({
        name: p.name,
        value: `${p.cancelCount} annulleringar`,
      }),
    ),

    worstRoi: winner(
      players,
      (p) => p.roi !== null,
      (a, b) => (a.roi ?? 0) - (b.roi ?? 0),
      (p) => ({
        name: p.name,
        value: `${p.roi! >= 0 ? "+" : ""}${p.roi!.toFixed(0)}%`,
      }),
    ),

    worstWinRate: winner(
      players,
      (p) => p.settled.length >= 3,
      (a, b) => (a.winRate ?? 0) - (b.winRate ?? 0),
      (p) => ({
        name: p.name,
        value: `${p.winRate!.toFixed(0)}% vunna`,
        detail: `${p.won.length} vunna av ${p.settled.length} slip`,
      }),
    ),

    biggestLoss: winner(
      players,
      (p) => p.biggestLostStake > 0,
      (a, b) => b.biggestLostStake - a.biggestLostStake,
      (p) => ({
        name: p.name,
        value: `−${p.biggestLostStake.toLocaleString("sv-SE")} coins`,
      }),
    ),

    mostDefensive: winner(
      players,
      (p) => p.avgOdds !== null && p.settled.length >= 2,
      (a, b) => (a.avgOdds ?? 999) - (b.avgOdds ?? 999),
      (p) => ({
        name: p.name,
        value: `${p.avgOdds!.toFixed(2)}x snittodds`,
        detail: `${p.settled.length} avgjorda slip`,
      }),
    ),

    favouriteFail: winner(
      players,
      (p) => p.lowestLostOdds < Infinity,
      (a, b) => a.lowestLostOdds - b.lowestLostOdds,
      (p) => ({
        name: p.name,
        value: `${p.lowestLostOdds.toFixed(2)}x`,
        detail: "lägst odds på ett förlorat slip",
      }),
    ),

    biggestRisk: winner(
      players,
      (p) => p.highestLostOdds > 0,
      (a, b) => b.highestLostOdds - a.highestLostOdds,
      (p) => ({
        name: p.name,
        value: `${p.highestLostOdds.toFixed(2)}x`,
        detail: "högst odds på ett förlorat slip",
      }),
    ),

    loseStreak: winner(
      players,
      (p) => p.loseStreak >= 2,
      (a, b) => b.loseStreak - a.loseStreak,
      (p) => ({
        name: p.name,
        value: `${p.loseStreak} i rad`,
      }),
    ),
  };
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
        <TopBar title="Skäms-lista" />
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

  const members = (rawMembers ?? []) as unknown as MemberRow[];
  const memberIds = members.map((m) => m.id);

  const [slipsRes, feesRes] = await Promise.all([
    memberIds.length > 0
      ? admin
          .from("bet_slips")
          .select("id, league_member_id, stake, combined_odds, final_odds, status, settled_at, placed_at")
          .in("league_member_id", memberIds)
          .in("status", ["won", "lost", "cancelled"])
      : { data: [] },
    memberIds.length > 0
      ? admin
          .from("match_wallet_transactions")
          .select("league_member_id, amount")
          .in("league_member_id", memberIds)
          .eq("type", "inactivity_fee")
      : { data: [] },
  ]);

  const slips = (slipsRes.data ?? []) as unknown as SlipRow[];
  const fees  = (feesRes.data  ?? []) as unknown as FeeRow[];

  const stats = computeShame(members, slips, fees);
  const hasSettledSlips = slips.some((s) => s.status === "won" || s.status === "lost");

  const categories: {
    emoji: string;
    title: string;
    description: string;
    winner: ShameWinner;
    alwaysShow?: boolean;
  }[] = [
    {
      emoji: "🥱",
      title: "Flest avgifter",
      description: "Glömde betta flest gånger",
      winner: stats.feeCount,
      alwaysShow: true,
    },
    {
      emoji: "🔁",
      title: "Ångerbuk",
      description: "Flest annullerade slip",
      winner: stats.cancelCount,
      alwaysShow: true,
    },
    {
      emoji: "📉",
      title: "Sämst ROI",
      description: "Sämst avkastning på insatser",
      winner: stats.worstRoi,
    },
    {
      emoji: "😩",
      title: "Sämst vinstprocent",
      description: "Förlorar mest — minst 3 slip krävs",
      winner: stats.worstWinRate,
    },
    {
      emoji: "💸",
      title: "Dyraste miss",
      description: "Störst insats på ett enda förlorat slip",
      winner: stats.biggestLoss,
    },
    {
      emoji: "🐢",
      title: "Saftigast",
      description: "Lägst snittodds — tar aldrig risker",
      winner: stats.mostDefensive,
    },
    {
      emoji: "🤦",
      title: "Förlorade på favorit",
      description: "Lägst odds på ett förlorat slip — borde gå hem",
      winner: stats.favouriteFail,
    },
    {
      emoji: "🎲",
      title: "Stor risk, inget resultat",
      description: "Högst odds på ett förlorat slip",
      winner: stats.biggestRisk,
    },
    {
      emoji: "❌",
      title: "Längsta förlorarserie",
      description: "Flest förluster i rad",
      winner: stats.loseStreak,
    },
  ];

  const visibleCategories = categories.filter(
    (c) => c.alwaysShow || hasSettledSlips,
  );

  return (
    <>
      <TopBar title="Skäms-lista" />
      <div className="mx-auto max-w-lg px-4 py-5 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/stallning" className="text-sm font-semibold text-[var(--primary)]">
            ← Ställning
          </Link>
        </div>

        <div
          className="overflow-hidden rounded-2xl p-5 text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)" }}
        >
          <p className="text-2xl font-bold">💀 Skäms-lista</p>
          <p className="mt-1 text-sm text-red-200">
            Vem är turneringens största skam?
          </p>
        </div>

        {!hasSettledSlips && (
          <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-center text-xs text-gray-400">
            De flesta kategorier fylls i när matchresultat börjar avgöras.
          </p>
        )}

        {/* Cards */}
        <div className="space-y-2">
          {visibleCategories.map((cat) => (
            <ShameCard key={cat.title} {...cat} />
          ))}
        </div>

        <p className="pb-2 text-center text-[11px] text-gray-300">
          Statistik baseras på avgjorda matchslip.
        </p>
      </div>
    </>
  );
}

// ─── ShameCard ────────────────────────────────────────────────────────────────

function ShameCard({
  emoji,
  title,
  description,
  winner,
}: {
  emoji: string;
  title: string;
  description: string;
  winner: ShameWinner;
}) {
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
        {winner ? (
          <>
            <p className="text-sm font-semibold text-gray-900">{winner.name}</p>
            <div className="text-right">
              <p className="tabular-nums text-sm font-bold text-[var(--loss)]">{winner.value}</p>
              {winner.detail && (
                <p className="text-[11px] text-gray-400">{winner.detail}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">— inga data än</p>
        )}
      </div>
    </div>
  );
}
