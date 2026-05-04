import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import Link from "next/link";

function swDateTime(utc: string) {
  return new Date(utc).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type NextMatch = {
  id: string;
  scheduled_at: string;
  home_team: { name: string; flag_emoji: string | null } | null;
  away_team: { name: string; flag_emoji: string | null } | null;
  odds: { home_odds: number; draw_odds: number; away_odds: number }[] | null;
};

type ActiveSlip = {
  id: string;
  status: "open" | "locked";
  stake: number;
  potential_payout: number;
  selections: Array<{
    match: Array<{
      home_team: Array<{ short_name: string }>;
      away_team: Array<{ short_name: string }>;
    }>;
  }> | null;
};

export default async function DashboardPage() {
  const { supabase, user } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, match_wallet, special_wallet, league_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return (
      <>
        <TopBar title="VM Bet 2026" />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-gray-400">Du är inte med i någon liga ännu.</p>
          <p className="mt-1 text-xs text-gray-400">Kontakta admin för att bli tillagd.</p>
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

  const [slipsRes, matchesRes, marketsRes, betsRes] = await Promise.all([
    supabase
      .from("bet_slips")
      .select("id, status, stake, potential_payout, selections:bet_slip_selections(match:matches(home_team:teams!matches_home_team_id_fkey(short_name), away_team:teams!matches_away_team_id_fkey(short_name)))")
      .eq("league_member_id", member.id as string)
      .in("status", ["open", "locked"])
      .order("placed_at", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "id, scheduled_at, home_team:teams!matches_home_team_id_fkey(name, flag_emoji), away_team:teams!matches_away_team_id_fkey(name, flag_emoji), odds:match_odds(home_odds, draw_odds, away_odds)"
      )
      .eq("status", "scheduled")
      .order("scheduled_at")
      .limit(3),
    tournamentId
      ? supabase
          .from("special_markets")
          .select("id")
          .eq("tournament_id", tournamentId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("special_bets")
      .select("market_id, stake")
      .eq("league_member_id", member.id as string)
      .eq("status", "active"),
  ]);

  const openSlips   = (slipsRes.data ?? []) as unknown as ActiveSlip[];
  const nextMatches = (matchesRes.data ?? []) as unknown as NextMatch[];
  const markets     = marketsRes.data ?? [];
  const activeBets  = betsRes.data ?? [];

  const matchWallet   = member.match_wallet as number;
  const specialWallet = member.special_wallet as number;
  const totalCoins    = matchWallet + specialWallet;

  const specialStaked  = activeBets.reduce((sum, b) => sum + (b.stake as number), 0);
  const marketsWithBet = new Set(activeBets.map((b) => b.market_id)).size;
  const marketsTotal   = markets.length;
  const marketsMissing = marketsTotal - marketsWithBet;

  return (
    <>
      <TopBar title="VM Bet 2026" />
      <div className="mx-auto max-w-lg space-y-5 px-4 py-5">

        {/* ── Saldo (hero) ──────────────────────────────────────────────────── */}
        <section
          className="overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-gray-900/15"
          style={{
            background:
              "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a8a 100%)",
          }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Totalt saldo
            </p>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--coin)]">
              VM Bet 2026
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums">
              {totalCoins.toLocaleString("sv-SE")}
            </span>
            <span className="text-2xl">🪙</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Match</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-white">
                {matchWallet.toLocaleString("sv-SE")}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Specialbet</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-white">
                {specialWallet.toLocaleString("sv-SE")}
              </p>
            </div>
          </div>
        </section>

        {/* ── Quick action ──────────────────────────────────────────────────── */}
        <Link
          href="/bet"
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--primary-600)] active:bg-[var(--primary-600)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Lägg ett nytt slip
        </Link>

        {/* ── Aktiva slip ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Aktiva slip</h2>
            <Link href="/mina-bet" className="text-xs font-semibold text-[var(--primary)] hover:underline">
              Visa alla →
            </Link>
          </div>

          {openSlips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
              <p className="text-sm text-gray-500">Inga aktiva slip just nu</p>
              <p className="mt-1 text-xs text-gray-400">Lägg ditt första slip ovan</p>
            </div>
          ) : (
            <div className="space-y-2">
              {openSlips.slice(0, 3).map((slip) => {
                const matchSummary = (slip.selections ?? [])
                  .slice(0, 2)
                  .map((s) => {
                    const match = Array.isArray(s.match) ? s.match[0] : s.match;
                    const ht = Array.isArray(match?.home_team) ? match.home_team[0] : match?.home_team;
                    const at = Array.isArray(match?.away_team) ? match.away_team[0] : match?.away_team;
                    const h = ht?.short_name ?? "?";
                    const a = at?.short_name ?? "?";
                    return `${h} vs ${a}`;
                  })
                  .join(", ");
                const extraCount = (slip.selections?.length ?? 0) - 2;
                return (
                  <div
                    key={slip.id}
                    className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            slip.status === "open"
                              ? "bg-[var(--primary-50)] text-[var(--primary)]"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {slip.status === "open" ? "Öppen" : "Låst"}
                        </span>
                        <span className="text-xs text-gray-500">
                          Insats{" "}
                          <strong className="tabular-nums text-gray-900">
                            {slip.stake.toLocaleString("sv-SE")}
                          </strong>
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">
                        Möjlig{" "}
                        <strong className="text-[var(--win)]">
                          {slip.potential_payout.toLocaleString("sv-SE")}
                        </strong>
                      </span>
                    </div>
                    {matchSummary && (
                      <p className="mt-1 truncate text-[11px] text-gray-400">
                        {matchSummary}
                        {extraCount > 0 && ` +${extraCount} till`}
                      </p>
                    )}
                  </div>
                );
              })}
              {openSlips.length > 3 && (
                <p className="text-center text-xs text-gray-400">
                  +{openSlips.length - 3} till —{" "}
                  <Link href="/mina-bet" className="font-semibold text-[var(--primary)]">
                    visa alla
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Nästa matcher ─────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Nästa matcher</h2>
            <Link href="/matcher" className="text-xs font-semibold text-[var(--primary)] hover:underline">
              Alla matcher →
            </Link>
          </div>

          {nextMatches.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-400">
              Inga kommande matcher.
            </p>
          ) : (
            <div className="space-y-2">
              {nextMatches.map((m) => {
                const o = Array.isArray(m.odds) ? (m.odds[0] ?? null) : m.odds;
                return (
                  <Link
                    key={m.id}
                    href="/bet"
                    className="block rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    <p className="text-xs font-medium text-gray-400 tabular-nums">{swDateTime(m.scheduled_at)}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      <span className="text-base">{m.home_team?.flag_emoji}</span>{" "}
                      {m.home_team?.name ?? "?"}
                      <span className="mx-1.5 text-gray-300">vs</span>
                      <span className="text-base">{m.away_team?.flag_emoji}</span>{" "}
                      {m.away_team?.name ?? "?"}
                    </p>
                    {o && (
                      <div className="mt-2 flex gap-1.5">
                        <OddsPill label="H" value={o.home_odds} />
                        <OddsPill label="X" value={o.draw_odds} />
                        <OddsPill label="B" value={o.away_odds} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Specialbet-status ─────────────────────────────────────────────── */}
        {marketsTotal > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Specialbet</h2>
              <Link href="/specialbet" className="text-xs font-semibold text-[var(--primary)] hover:underline">
                Hantera →
              </Link>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">
                    {marketsWithBet}
                    <span className="text-base font-normal text-gray-400">/{marketsTotal}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Marknader satta</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">
                    {specialStaked.toLocaleString("sv-SE")}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    av {(specialStaked + specialWallet).toLocaleString("sv-SE")} 🪙
                  </p>
                </div>
              </div>

              {marketsMissing > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="flex items-center gap-2 text-xs text-amber-800">
                    <span aria-hidden>⚠</span>
                    <span className="font-medium">
                      {marketsWithBet} av {marketsTotal} lagda —{" "}
                      {marketsMissing === 1 ? "1 marknad" : `${marketsMissing} marknader`} kvar
                    </span>
                  </p>
                  <Link
                    href="/specialbet"
                    className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--primary-600)] active:bg-[var(--primary-600)]"
                  >
                    Lägg specialbet nu
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                         strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
                </div>
              )}

              {marketsWithBet === marketsTotal && marketsTotal > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--win-50)] px-3 py-2 text-xs text-[var(--win)]">
                  <span className="font-bold text-[var(--win)]">✓</span>
                  <span className="font-medium">Alla marknader är satta</span>
                </div>
              )}
            </div>
          </section>
        )}

      </div>
    </>
  );
}

function OddsPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
      <span className="font-bold text-gray-400">{label}</span>
      <span className="font-bold tabular-nums text-gray-900">{value.toFixed(2)}</span>
    </span>
  );
}
