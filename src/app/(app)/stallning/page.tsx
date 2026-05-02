import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";

// ─── Local types ──────────────────────────────────────────────────────────────

type MemberRow = {
  id: string;
  user_id: string;
  match_wallet: number;
  special_wallet: number;
  profile: { display_name: string; email: string | null } | { display_name: string; email: string | null }[] | null;
};

type SlipRow = {
  id: string;
  league_member_id: string;
  stake: number;
  final_odds: number | null;
  combined_odds: number;
  status: "won" | "lost";
  settled_at: string | null;
};

// ─── Leaderboard ──────────────────────────────────────────────────────────────

type LeaderboardEntry = {
  position: number;
  memberId: string;
  userId: string;
  name: string;
  totalCoins: number;
  bestOdds: number;
  wonCount: number;
};

function buildLeaderboard(members: MemberRow[], slips: SlipRow[]): LeaderboardEntry[] {
  const wonByMember = new Map<string, SlipRow[]>();
  for (const m of members) wonByMember.set(m.id, []);
  for (const s of slips) {
    if (s.status === "won") wonByMember.get(s.league_member_id)?.push(s);
  }

  const entries = members.map((m) => {
    const won = wonByMember.get(m.id) ?? [];
    const profile = Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile;
    const rawName = profile?.display_name;
    const emailPrefix = profile?.email?.split("@")[0];
    const emailName = emailPrefix
      ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
      : undefined;
    const name = rawName && !rawName.includes("@") ? rawName : (emailName ?? "Okänd");
    return {
      memberId: m.id,
      userId: m.user_id,
      name,
      totalCoins: m.match_wallet + m.special_wallet,
      // Tie-breaker 1: highest final_odds on a single winning slip
      bestOdds: won.reduce((max, s) => Math.max(max, s.final_odds ?? s.combined_odds), 0),
      wonCount: won.length,
    };
  });

  entries.sort((a, b) => {
    if (b.totalCoins !== a.totalCoins) return b.totalCoins - a.totalCoins;
    if (b.bestOdds !== a.bestOdds) return b.bestOdds - a.bestOdds;
    return b.wonCount - a.wonCount;
  });

  // Assign positions — ties share a position, next position skips
  let pos = 1;
  return entries.map((entry, i) => {
    if (i > 0) {
      const prev = entries[i - 1];
      const tied =
        entry.totalCoins === prev.totalCoins &&
        entry.bestOdds   === prev.bestOdds   &&
        entry.wonCount   === prev.wonCount;
      if (!tied) pos = i + 1;
    }
    return { ...entry, position: pos };
  });
}

// ─── Statistics ───────────────────────────────────────────────────────────────

type PlayerStats = {
  name: string;
  roi: number;
  totalLost: number;
  maxWinStreak: number;
  maxLoseStreak: number;
};

type SingleBet = { playerName: string; amount: number; odds: number };

type Stats = {
  bestRoi: PlayerStats | null;
  worstRoi: PlayerStats | null;
  mostLost: PlayerStats | null;
  longestWin: PlayerStats | null;
  longestLose: PlayerStats | null;
  bestBet: SingleBet | null;
  worstBet: SingleBet | null;
};

function computeStats(members: MemberRow[], slips: SlipRow[]): Stats {
  const byMember = new Map<string, SlipRow[]>();
  for (const m of members) byMember.set(m.id, []);
  for (const s of slips) byMember.get(s.league_member_id)?.push(s);

  const all: PlayerStats[] = [];
  let bestBet: SingleBet | null = null;
  let worstBet: SingleBet | null = null;

  for (const m of members) {
    const profile = Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile;
    const rawName = profile?.display_name;
    const emailPrefix = profile?.email?.split("@")[0];
    const emailName = emailPrefix
      ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
      : undefined;
    const name = rawName && !rawName.includes("@") ? rawName : (emailName ?? "Okänd");

    // Sort by settled_at for streak calculation
    const settled = (byMember.get(m.id) ?? []).sort((a, b) =>
      new Date(a.settled_at ?? 0).getTime() - new Date(b.settled_at ?? 0).getTime()
    );
    if (settled.length === 0) continue;

    const totalStaked = settled.reduce((sum, s) => sum + s.stake, 0);
    // Actual payout = floor(stake × final_odds) for won slips (mirrors settlement RPC)
    const totalPayout = settled
      .filter((s) => s.status === "won")
      .reduce((sum, s) => sum + Math.floor(s.stake * (s.final_odds ?? s.combined_odds)), 0);
    const roi = totalStaked > 0 ? ((totalPayout - totalStaked) / totalStaked) * 100 : 0;
    const totalLost = settled
      .filter((s) => s.status === "lost")
      .reduce((sum, s) => sum + s.stake, 0);

    // Streaks — won/lost only (void/cancelled are not fetched)
    let maxWin = 0, maxLose = 0, curWin = 0, curLose = 0;
    for (const s of settled) {
      if (s.status === "won") {
        curWin++; curLose = 0;
        if (curWin > maxWin) maxWin = curWin;
      } else {
        curLose++; curWin = 0;
        if (curLose > maxLose) maxLose = curLose;
      }
    }

    all.push({ name, roi, totalLost, maxWinStreak: maxWin, maxLoseStreak: maxLose });

    // Best single bet: won slip with highest actual payout
    for (const s of settled.filter((s) => s.status === "won")) {
      const payout = Math.floor(s.stake * (s.final_odds ?? s.combined_odds));
      if (!bestBet || payout > bestBet.amount) {
        bestBet = { playerName: name, amount: payout, odds: s.final_odds ?? s.combined_odds };
      }
    }
    // Worst bet: lost slip with highest stake
    for (const s of settled.filter((s) => s.status === "lost")) {
      if (!worstBet || s.stake > worstBet.amount) {
        worstBet = { playerName: name, amount: s.stake, odds: s.combined_odds };
      }
    }
  }

  if (all.length === 0) {
    return {
      bestRoi: null, worstRoi: null, mostLost: null,
      longestWin: null, longestLose: null, bestBet: null, worstBet: null,
    };
  }

  const byRoi      = [...all].sort((a, b) => b.roi - a.roi);
  const byLost     = [...all].sort((a, b) => b.totalLost - a.totalLost);
  const byWinStr   = [...all].sort((a, b) => b.maxWinStreak - a.maxWinStreak);
  const byLoseStr  = [...all].sort((a, b) => b.maxLoseStreak - a.maxLoseStreak);

  return {
    bestRoi:     byRoi[0]     ?? null,
    worstRoi:    byRoi[byRoi.length - 1] ?? null,
    mostLost:    byLost[0]    ?? null,
    longestWin:  byWinStr[0]  ?? null,
    longestLose: byLoseStr[0] ?? null,
    bestBet,
    worstBet,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function positionMedal(pos: number): string | null {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return null;
}

function fmtRoi(roi: number) {
  const sign = roi >= 0 ? "+" : "";
  return `${sign}${roi.toFixed(0)}%`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StallningPage() {
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
          <p className="text-sm text-gray-400">Du är inte med i någon liga ännu.</p>
        </div>
      </>
    );
  }

  // All active members in the same league
  const { data: rawMembers } = await supabase
    .from("league_members")
    .select("id, user_id, match_wallet, special_wallet, profile:profiles(display_name, email)")
    .eq("league_id", member.league_id as string)
    .eq("is_active", true);

  const members = (rawMembers ?? []) as unknown as MemberRow[];
  const memberIds = members.map((m) => m.id);

  // All won+lost slips for the league (void/cancelled excluded — not relevant for any stat)
  const { data: rawSlips } =
    memberIds.length > 0
      ? await supabase
          .from("bet_slips")
          .select("id, league_member_id, stake, final_odds, combined_odds, status, settled_at")
          .in("league_member_id", memberIds)
          .in("status", ["won", "lost"])
          .order("settled_at")
      : { data: [] };

  const slips = (rawSlips ?? []) as unknown as SlipRow[];

  // My coins delta since yesterday — own transactions only (RLS limits to own rows)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: myTxData } = member
    ? await supabase
        .from("match_wallet_transactions")
        .select("amount")
        .eq("league_member_id", member.id)
        .gte("created_at", yesterday)
    : { data: [] };
  const myDelta = (myTxData ?? []).reduce((sum, tx) => sum + (tx.amount as number), 0);

  const leaderboard = buildLeaderboard(members, slips);
  const stats = computeStats(members, slips);
  const hasStats = slips.length > 0;

  return (
    <>
      <TopBar title="Ställning" />
      <div className="mx-auto max-w-lg space-y-6 px-4 py-5">

        {/* ── Topplista ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Topplista
          </h2>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            {leaderboard.map((entry, i) => {
              const isMe  = entry.userId === user.id;
              const medal = positionMedal(entry.position);
              return (
                <div
                  key={entry.memberId}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i < leaderboard.length - 1 ? "border-b border-gray-50" : ""
                  } ${isMe ? "bg-[var(--primary-50)] border-l-4 border-l-[var(--primary)]" : ""}`}
                >
                  {/* Position / medal */}
                  <span className="grid w-8 shrink-0 place-items-center">
                    {medal ? (
                      <span className="text-xl leading-none" aria-hidden>{medal}</span>
                    ) : (
                      <span className={`text-sm font-bold tabular-nums ${
                        isMe ? "text-[var(--primary)]" : "text-gray-400"
                      }`}>
                        {entry.position}
                      </span>
                    )}
                  </span>

                  {/* Name */}
                  <span className={`flex-1 truncate text-sm ${
                    isMe ? "font-bold text-[var(--primary-600)]" : "font-medium text-gray-900"
                  }`}>
                    {entry.name}
                    {isMe && (
                      <span className="ml-1.5 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        du
                      </span>
                    )}
                  </span>

                  {/* Coins */}
                  <div className="flex flex-col items-end">
                    <span className={`tabular-nums text-base font-bold ${
                      isMe ? "text-[var(--primary-600)]" : "text-gray-900"
                    }`}>
                      {entry.totalCoins.toLocaleString("sv-SE")}{" "}
                      <span className="text-xs text-[var(--coin)]">🪙</span>
                    </span>
                    {isMe && myDelta !== 0 && (
                      <span className={`tabular-nums text-xs font-semibold ${
                        myDelta > 0 ? "text-[var(--win)]" : "text-[var(--loss)]"
                      }`}>
                        {myDelta > 0 ? "▲ +" : "▼ "}{myDelta.toLocaleString("sv-SE")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Statistik — döljs helt tills det finns avgjorda slip ─────────── */}
        {hasStats && (
          <>
            {/* Heder */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                <span aria-hidden>🏆</span> Heder
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <StatRow
                  label="Bäst ROI"
                  player={stats.bestRoi?.name}
                  value={stats.bestRoi ? fmtRoi(stats.bestRoi.roi) : "–"}
                  valueColor="text-[var(--win)]"
                />
                <StatRow
                  label="Längsta vinnarserie"
                  player={stats.longestWin?.name}
                  value={
                    stats.longestWin?.maxWinStreak
                      ? `${stats.longestWin.maxWinStreak} i rad`
                      : "–"
                  }
                />
                <StatRow
                  label="Bästa enskilda bet"
                  player={stats.bestBet?.playerName}
                  value={
                    stats.bestBet
                      ? `+${stats.bestBet.amount.toLocaleString("sv-SE")} (${stats.bestBet.odds.toFixed(2)}x)`
                      : "–"
                  }
                  valueColor="text-[var(--win)]"
                  last
                />
              </div>
            </section>

            {/* Skam */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
                <span aria-hidden>💀</span> Skam
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                <StatRow
                  label="Sämst ROI"
                  player={stats.worstRoi?.name}
                  value={stats.worstRoi ? fmtRoi(stats.worstRoi.roi) : "–"}
                  valueColor="text-[var(--loss)]"
                />
                <StatRow
                  label="Mest förlorat"
                  player={stats.mostLost?.name}
                  value={
                    stats.mostLost
                      ? `${stats.mostLost.totalLost.toLocaleString("sv-SE")} coins`
                      : "–"
                  }
                  valueColor="text-[var(--loss)]"
                />
                <StatRow
                  label="Längsta förlorarserie"
                  player={stats.longestLose?.name}
                  value={
                    stats.longestLose?.maxLoseStreak
                      ? `${stats.longestLose.maxLoseStreak} i rad`
                      : "–"
                  }
                />
                <StatRow
                  label="Sämsta bet"
                  player={stats.worstBet?.playerName}
                  value={
                    stats.worstBet
                      ? `−${stats.worstBet.amount.toLocaleString("sv-SE")} (${stats.worstBet.odds.toFixed(2)}x)`
                      : "–"
                  }
                  valueColor="text-[var(--loss)]"
                  last
                />
              </div>
              <p className="mt-1.5 px-1 text-xs text-gray-400">
                Statistik baseras enbart på avgjorda matchslip.
              </p>
            </section>
          </>
        )}

      </div>
    </>
  );
}

// ─── StatRow (small presentational component) ─────────────────────────────────

function StatRow({
  label,
  player,
  value,
  valueColor = "text-gray-900",
  last = false,
}: {
  label: string;
  player?: string;
  value: string;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 ${
        last ? "" : "border-b border-gray-50"
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium text-gray-800">{player ?? "–"}</p>
      </div>
      <span className={`shrink-0 tabular-nums text-sm font-semibold ${valueColor}`}>
        {value}
      </span>
    </div>
  );
}
