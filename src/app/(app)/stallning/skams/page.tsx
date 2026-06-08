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
};

type FeeRow = {
  league_member_id: string;
  amount: number;
};

type ShameWinner = {
  names: string[];
  value: string;
  detail?: string;
} | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function memberName(profile: ProfileRow | ProfileRow[] | null): string {
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
  if (!p) return "Okänd";
  const raw = p.display_name;
  if (raw && !raw.includes("@")) return raw;
  const prefix = p.email?.split("@")[0];
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Okänd";
}

// ─── Per-player stats ─────────────────────────────────────────────────────────

type PlayerData = {
  id: string;
  name: string;
  feeCount: number;
  feeTotal: number;
  cancelCount: number;
  settledCount: number;
  lostCount: number;
  wonCount: number;
  roi: number | null;
  winRate: number | null;
  avgOdds: number | null;
  biggestLostStake: number;
  lowestLostOdds: number;   // Infinity if no lost slips
  highestLostOdds: number;  // 0 if no lost slips
  loseStreak: number;
};

function buildPlayerData(
  members: MemberRow[],
  slips: SlipRow[],
  fees: FeeRow[],
): PlayerData[] {
  const byMember = new Map<string, SlipRow[]>();
  for (const m of members) byMember.set(m.id, []);
  for (const s of slips) byMember.get(s.league_member_id)?.push(s);

  const feeCounts  = new Map<string, number>();
  const feeAmounts = new Map<string, number>();
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
    const lost      = settled.filter((s) => s.status === "lost");
    const won       = settled.filter((s) => s.status === "won");
    const cancelled = all.filter((s) => s.status === "cancelled");

    const totalStaked  = settled.reduce((s, r) => s + r.stake, 0);
    const totalPayout  = won.reduce((s, r) => s + Math.floor(r.stake * (r.final_odds ?? r.combined_odds)), 0);
    const roi          = totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : null;
    const winRate      = settled.length > 0 ? (won.length / settled.length) * 100 : null;
    const avgOdds      = settled.length > 0
      ? settled.reduce((s, r) => s + r.combined_odds, 0) / settled.length
      : null;

    const biggestLostStake = lost.reduce((max, r) => Math.max(max, r.stake), 0);
    const lowestLostOdds   = lost.reduce((min, r) => Math.min(min, r.combined_odds), Infinity);
    const highestLostOdds  = lost.reduce((max, r) => Math.max(max, r.combined_odds), 0);

    let maxStreak = 0, cur = 0;
    for (const s of settled) {
      if (s.status === "lost") { cur++; if (cur > maxStreak) maxStreak = cur; }
      else cur = 0;
    }

    return {
      id: m.id, name,
      feeCount:  feeCounts.get(m.id)  ?? 0,
      feeTotal:  feeAmounts.get(m.id) ?? 0,
      cancelCount: cancelled.length,
      settledCount: settled.length,
      lostCount:  lost.length,
      wonCount:   won.length,
      roi, winRate, avgOdds,
      biggestLostStake,
      lowestLostOdds,
      highestLostOdds,
      loseStreak: maxStreak,
    };
  });
}

// ─── Tied-winner helper ───────────────────────────────────────────────────────
// Returns all players that share the worst score (ties included).

function shameWinner(
  players: PlayerData[],
  filter: (p: PlayerData) => boolean,
  metric: (p: PlayerData) => number,
  direction: "min" | "max",
  format: (metric: number, first: PlayerData) => { value: string; detail?: string },
): ShameWinner {
  const eligible = players.filter(filter);
  if (eligible.length === 0) return null;

  const scored = eligible.map((p) => ({ p, score: metric(p) }));
  const worst  = direction === "min"
    ? Math.min(...scored.map((s) => s.score))
    : Math.max(...scored.map((s) => s.score));

  const tied = scored.filter((s) => s.score === worst).map((s) => s.p);
  const { value, detail } = format(worst, tied[0]);
  return { names: tied.map((p) => p.name), value, detail };
}

// ─── Compute all shame categories ────────────────────────────────────────────

type ShameStats = {
  feeCount:      ShameWinner;
  cancelCount:   ShameWinner;
  worstRoi:      ShameWinner;
  worstWinRate:  ShameWinner;
  biggestLoss:   ShameWinner;
  mostDefensive: ShameWinner;
  favouriteFail: ShameWinner;
  biggestRisk:   ShameWinner;
  loseStreak:    ShameWinner;
};

function computeShame(players: PlayerData[]): ShameStats {
  const sw = shameWinner;
  return {
    feeCount: sw(
      players,
      (p) => p.feeCount > 0,
      (p) => p.feeCount,
      "max",
      (v, p) => ({ value: `${v} avgifter`, detail: `−${p.feeTotal.toLocaleString("sv-SE")} coins totalt` }),
    ),

    cancelCount: sw(
      players,
      (p) => p.cancelCount > 0,
      (p) => p.cancelCount,
      "max",
      (v) => ({ value: `${v} annulleringar` }),
    ),

    worstRoi: sw(
      players,
      (p) => p.roi !== null,
      (p) => p.roi!,
      "min",
      (v) => ({ value: `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` }),
    ),

    worstWinRate: sw(
      players,
      (p) => p.winRate !== null && p.settledCount >= 3,
      (p) => p.winRate!,
      "min",
      (v, p) => ({
        value: `${v.toFixed(0)}% vunna`,
        detail: `${p.wonCount} vunna av ${p.settledCount} slip`,
      }),
    ),

    biggestLoss: sw(
      players,
      (p) => p.biggestLostStake > 0,
      (p) => p.biggestLostStake,
      "max",
      (v) => ({ value: `−${v.toLocaleString("sv-SE")} coins` }),
    ),

    mostDefensive: sw(
      players,
      (p) => p.avgOdds !== null && p.settledCount >= 2,
      (p) => p.avgOdds!,
      "min",
      (v, p) => ({
        value: `${v.toFixed(2)}x snittodds`,
        detail: `${p.settledCount} avgjorda slip`,
      }),
    ),

    favouriteFail: sw(
      players,
      (p) => p.lowestLostOdds < Infinity,
      (p) => p.lowestLostOdds,
      "min",
      (v) => ({
        value: `${v.toFixed(2)}x`,
        detail: "lägst odds på ett förlorat slip",
      }),
    ),

    biggestRisk: sw(
      players,
      (p) => p.highestLostOdds > 0,
      (p) => p.highestLostOdds,
      "max",
      (v) => ({
        value: `${v.toFixed(2)}x`,
        detail: "högst odds på ett förlorat slip",
      }),
    ),

    loseStreak: sw(
      players,
      (p) => p.loseStreak >= 2,
      (p) => p.loseStreak,
      "max",
      (v) => ({ value: `${v} i rad` }),
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

  const members  = (rawMembers ?? []) as unknown as MemberRow[];
  const memberIds = members.map((m) => m.id);

  const [slipsRes, feesRes] = await Promise.all([
    memberIds.length > 0
      ? admin
          .from("bet_slips")
          .select("id, league_member_id, stake, combined_odds, final_odds, status, settled_at")
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

  const slips   = (slipsRes.data  ?? []) as unknown as SlipRow[];
  const fees    = (feesRes.data   ?? []) as unknown as FeeRow[];
  const players = buildPlayerData(members, slips, fees);
  const stats   = computeShame(players);

  const categories: { emoji: string; title: string; description: string; winner: ShameWinner }[] = [
    {
      emoji: "🥱",
      title: "Flest avgifter",
      description: "Glömde betta flest gånger",
      winner: stats.feeCount,
    },
    {
      emoji: "🔁",
      title: "Ångerbuk",
      description: "Flest annullerade slip",
      winner: stats.cancelCount,
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
      description: "Lägst odds på ett förlorat slip",
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

  return (
    <>
      <TopBar title="Skäms-lista" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-5">

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
          <p className="mt-1 text-sm text-red-200">Vem är turneringens största skam?</p>
        </div>

        <div className="space-y-2">
          {categories.map((cat) => (
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
            <div className="min-w-0">
              {winner.names.map((name) => (
                <p key={name} className="truncate text-sm font-semibold text-gray-900">{name}</p>
              ))}
            </div>
            <div className="shrink-0 text-right">
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
