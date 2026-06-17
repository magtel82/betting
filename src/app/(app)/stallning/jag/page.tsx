import { requireActiveUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopBar } from "@/components/nav/TopBar";
import { FlagIcon } from "@/components/FlagIcon";
import { StallningTabs } from "../_components/StallningTabs";
import type { BetOutcome } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlipRow = {
  id: string;
  stake: number;
  combined_odds: number;
  final_odds: number | null;
  status: "open" | "locked" | "won" | "lost" | "void" | "cancelled";
  settled_at: string | null;
};
type TxRow = { amount: number; type: string; created_at: string };
type TeamMini = { name: string; short_name: string; flag_code: string | null };
type SelRow = {
  outcome: BetOutcome;
  match: {
    home_team: TeamMini | TeamMini[] | null;
    away_team: TeamMini | TeamMini[] | null;
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function payout(s: SlipRow) {
  return Math.floor(s.stake * (s.final_odds ?? s.combined_odds));
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function fmtSigned(n: number) {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("sv-SE")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MinStatPage() {
  const { supabase, user, profile } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, match_wallet")
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

  const memberId = member.id as string;
  const wallet   = (member.match_wallet as number) ?? 0;
  const admin    = createAdminClient();

  const [slipsRes, txRes] = await Promise.all([
    admin.from("bet_slips")
      .select("id, stake, combined_odds, final_odds, status, settled_at")
      .eq("league_member_id", memberId),
    admin.from("match_wallet_transactions")
      .select("amount, type, created_at")
      .eq("league_member_id", memberId)
      .order("created_at"),
  ]);

  const slips = (slipsRes.data ?? []) as SlipRow[];
  const txs   = (txRes.data   ?? []) as TxRow[];

  // Selections (for tendencies) — only for this member's slips.
  const slipIds = slips.map((s) => s.id);
  const { data: selData } = slipIds.length > 0
    ? await admin.from("bet_slip_selections")
        .select("outcome, match:matches(home_team:teams!matches_home_team_id_fkey(name, short_name, flag_code), away_team:teams!matches_away_team_id_fkey(name, short_name, flag_code))")
        .in("slip_id", slipIds)
    : { data: [] };
  const selections = (selData ?? []) as unknown as SelRow[];

  // ── Slip aggregates ──────────────────────────────────────────────────────────
  const settled = slips
    .filter((s) => s.status === "won" || s.status === "lost")
    .sort((a, b) => new Date(a.settled_at ?? 0).getTime() - new Date(b.settled_at ?? 0).getTime());
  const won  = settled.filter((s) => s.status === "won");
  const lost = settled.filter((s) => s.status === "lost");
  const activeCount = slips.filter((s) => s.status === "open" || s.status === "locked").length;

  const totalStaked = settled.reduce((acc, s) => acc + s.stake, 0);
  const totalPayout = won.reduce((acc, s) => acc + payout(s), 0);
  const netBetting  = totalPayout - totalStaked;

  const roi     = totalStaked > 0 ? (netBetting / totalStaked) * 100 : null;
  const winRate = settled.length > 0 ? (won.length / settled.length) * 100 : null;
  const avgOdds = settled.length > 0 ? settled.reduce((a, s) => a + s.combined_odds, 0) / settled.length : null;

  // Longest + current win streak (chronological)
  let bestStreak = 0, curStreak = 0, runStreak = 0;
  for (const s of settled) {
    if (s.status === "won") { runStreak++; if (runStreak > bestStreak) bestStreak = runStreak; }
    else runStreak = 0;
  }
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].status === "won") curStreak++; else break;
  }

  const biggestWin  = won.reduce((max, s)  => Math.max(max, payout(s)), 0);
  const biggestLoss = lost.reduce((max, s) => Math.max(max, s.stake), 0);
  const highestWonOdds = won.reduce((max, s) => Math.max(max, s.final_odds ?? s.combined_odds), 0);

  // ── Balance curve (running balance anchored to current wallet) ───────────────
  const totalTx     = txs.reduce((a, t) => a + t.amount, 0);
  const startBalance = wallet - totalTx;
  const balancePoints: number[] = [startBalance];
  let running = startBalance;
  for (const t of txs) { running += t.amount; balancePoints.push(running); }

  // ── Outcome tendencies ───────────────────────────────────────────────────────
  const outcomeCounts: Record<BetOutcome, number> = { home: 0, draw: 0, away: 0 };
  const teamCounts = new Map<string, { name: string; short: string; flag: string | null; n: number }>();
  for (const sel of selections) {
    outcomeCounts[sel.outcome] = (outcomeCounts[sel.outcome] ?? 0) + 1;
    const m = sel.match;
    if (!m) continue;
    const backed = sel.outcome === "home" ? one(m.home_team)
                 : sel.outcome === "away" ? one(m.away_team)
                 : null;
    if (backed) {
      const cur = teamCounts.get(backed.name) ?? { name: backed.name, short: backed.short_name, flag: backed.flag_code, n: 0 };
      cur.n++;
      teamCounts.set(backed.name, cur);
    }
  }
  const totalSelections = outcomeCounts.home + outcomeCounts.draw + outcomeCounts.away;
  const topTeams = [...teamCounts.values()].sort((a, b) => b.n - a.n).slice(0, 3);

  const displayName = (profile.display_name && !profile.display_name.includes("@"))
    ? profile.display_name
    : (user.email?.split("@")[0] ?? "Du");

  const hasData = settled.length > 0 || activeCount > 0 || txs.length > 0;

  return (
    <>
      <TopBar title="Ställning" />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">

        <StallningTabs />

        {!hasData ? (
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-12 text-center shadow-sm">
            <p className="text-3xl">📈</p>
            <p className="mt-2 text-sm font-semibold text-gray-800">Ingen statistik än</p>
            <p className="mt-1 text-xs text-gray-400">Lägg ditt första slip så börjar din statistik byggas här.</p>
          </div>
        ) : (
          <>
            {/* ── Hero: saldo + netto ─────────────────────────────────────────── */}
            <section
              className="rounded-2xl px-5 py-5 text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, #0c1f3f 0%, #14346b 55%, #1d4ed8 100%)" }}
            >
              <p className="text-xs font-medium text-blue-200">{displayName} · matchsaldo</p>
              <p className="mt-1 text-4xl font-black tabular-nums">
                {wallet.toLocaleString("sv-SE")} <span className="text-xl font-bold text-[var(--coin)]">🪙</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="text-blue-200">Netto från spel: </span>
                  <strong className={`tabular-nums ${netBetting >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {fmtSigned(netBetting)} 🪙
                  </strong>
                </span>
                {roi !== null && (
                  <span>
                    <span className="text-blue-200">ROI: </span>
                    <strong className={`tabular-nums ${roi >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                      {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
                    </strong>
                  </span>
                )}
              </div>
            </section>

            {/* ── Saldokurva ──────────────────────────────────────────────────── */}
            {balancePoints.length > 2 && (
              <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Saldoutveckling</h2>
                <BalanceChart points={balancePoints} />
                <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                  <span>Start: {Math.round(startBalance).toLocaleString("sv-SE")}</span>
                  <span>Nu: {wallet.toLocaleString("sv-SE")}</span>
                </div>
              </section>
            )}

            {/* ── Nyckeltal ───────────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Träffprocent" value={winRate !== null ? `${winRate.toFixed(0)}%` : "–"}
                sub={settled.length > 0 ? `${won.length} av ${settled.length} slip` : "inga avgjorda"} />
              <Metric label="Snittodds" value={avgOdds !== null ? `${avgOdds.toFixed(2)}x` : "–"} />
              <Metric label="Avgjorda slip" value={String(settled.length)} sub={`${activeCount} aktiva`} />
              <Metric label="Längsta svit" value={`${bestStreak}`} sub="vinster i rad" accent={bestStreak >= 2 ? "win" : undefined} />
              <Metric label="Aktuell svit" value={curStreak > 0 ? `${curStreak} 🔥` : "0"} sub="vinster i rad" accent={curStreak >= 2 ? "win" : undefined} />
              <Metric label="Spelade rader" value={String(totalSelections)} sub={`${slips.length} slip totalt`} />
            </section>

            {/* ── Höjdpunkter ─────────────────────────────────────────────────── */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Höjdpunkter</h2>
              <Highlight emoji="💰" label="Största vinst" value={biggestWin > 0 ? `+${biggestWin.toLocaleString("sv-SE")} 🪙` : "–"} accent="win" />
              <Highlight emoji="🎯" label="Högst vunna odds" value={highestWonOdds > 0 ? `${highestWonOdds.toFixed(2)}x` : "–"} accent="win" />
              <Highlight emoji="💸" label="Dyraste miss" value={biggestLoss > 0 ? `−${biggestLoss.toLocaleString("sv-SE")} 🪙` : "–"} accent="loss" />
            </section>

            {/* ── Tendenser ───────────────────────────────────────────────────── */}
            {totalSelections > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Dina tendenser</h2>

                {/* Outcome distribution bar */}
                <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-xs text-gray-500">Hur du spelar</p>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <span className="bg-[var(--primary)]" style={{ width: `${(outcomeCounts.home / totalSelections) * 100}%` }} />
                    <span className="bg-amber-400"          style={{ width: `${(outcomeCounts.draw / totalSelections) * 100}%` }} />
                    <span className="bg-rose-400"           style={{ width: `${(outcomeCounts.away / totalSelections) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-gray-500">
                    <span><span className="font-bold text-[var(--primary)]">Hemma</span> {Math.round((outcomeCounts.home / totalSelections) * 100)}%</span>
                    <span><span className="font-bold text-amber-500">Kryss</span> {Math.round((outcomeCounts.draw / totalSelections) * 100)}%</span>
                    <span><span className="font-bold text-rose-500">Borta</span> {Math.round((outcomeCounts.away / totalSelections) * 100)}%</span>
                  </div>
                </div>

                {/* Most-backed teams */}
                {topTeams.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                    <p className="border-b border-gray-50 bg-gray-50 px-4 py-2 text-xs text-gray-500">Lag du tror mest på</p>
                    {topTeams.map((t, i) => (
                      <div key={t.name} className={`flex items-center gap-2 px-4 py-2.5 ${i < topTeams.length - 1 ? "border-b border-gray-50" : ""}`}>
                        <FlagIcon code={t.flag} label={t.short} className="shrink-0 text-base" />
                        <span className="flex-1 truncate text-sm font-medium text-gray-800">{t.name}</span>
                        <span className="shrink-0 tabular-nums text-sm font-bold text-gray-900">
                          {t.n} {t.n === 1 ? "gång" : "gånger"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <p className="pb-2 text-center text-[11px] text-gray-300">
              Statistik baseras på dina matchslip och saldorörelser.
            </p>
          </>
        )}
      </div>
    </>
  );
}

// ─── Metric ─────────────────────────────────────────────────────────────────

function Metric({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: "win" | "loss";
}) {
  const color = accent === "win" ? "text-[var(--win)]" : accent === "loss" ? "text-[var(--loss)]" : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-3 text-center shadow-sm">
      <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-gray-600">{label}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Highlight ──────────────────────────────────────────────────────────────

function Highlight({ emoji, label, value, accent }: {
  emoji: string; label: string; value: string; accent: "win" | "loss";
}) {
  const color = accent === "win" ? "text-[var(--win)]" : "text-[var(--loss)]";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <span className="text-lg leading-none" aria-hidden>{emoji}</span>
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      <span className={`shrink-0 tabular-nums text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

// ─── BalanceChart (inline SVG sparkline) ──────────────────────────────────────

function BalanceChart({ points }: { points: number[] }) {
  const W = 320, H = 88, PAD = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${x(0).toFixed(1)},${(H - PAD).toFixed(1)} Z`;

  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "var(--win)" : "var(--loss)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="Saldoutveckling över tid">
      <defs>
        <linearGradient id="balfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#balfill)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
