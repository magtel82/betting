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
  home_team: { short_name: string; flag_emoji: string | null } | null;
  away_team: { short_name: string; flag_emoji: string | null } | null;
};

type ActiveSlip = {
  id: string;
  status: "open" | "locked";
  stake: number;
  potential_payout: number;
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
        <div className="mx-auto max-w-lg px-4 py-6">
          <p className="text-gray-500">Du är inte med i någon liga ännu.</p>
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
      .select("id, status, stake, potential_payout")
      .eq("league_member_id", member.id as string)
      .in("status", ["open", "locked"])
      .order("placed_at", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "id, scheduled_at, home_team:teams!matches_home_team_id_fkey(short_name, flag_emoji), away_team:teams!matches_away_team_id_fkey(short_name, flag_emoji)"
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

  const openSlips = (slipsRes.data ?? []) as ActiveSlip[];
  const nextMatches = (matchesRes.data ?? []) as unknown as NextMatch[];
  const markets = marketsRes.data ?? [];
  const activeBets = betsRes.data ?? [];

  const matchWallet   = member.match_wallet as number;
  const specialWallet = member.special_wallet as number;
  const totalCoins    = matchWallet + specialWallet;

  const specialStaked    = activeBets.reduce((sum, b) => sum + (b.stake as number), 0);
  const marketsWithBet   = new Set(activeBets.map((b) => b.market_id)).size;
  const marketsTotal     = markets.length;
  const marketsMissing   = marketsTotal - marketsWithBet;

  return (
    <>
      <TopBar title="VM Bet 2026" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-5">

        {/* ── Plånbok ───────────────────────────────────────────────────────── */}
        <section className="rounded-xl bg-gray-900 px-5 py-4 text-white">
          <p className="text-xs text-gray-400">Totalt saldo</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">
            {totalCoins.toLocaleString("sv-SE")}
          </p>
          <div className="mt-3 flex gap-8 border-t border-gray-700 pt-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Match</p>
              <p className="font-semibold tabular-nums">
                {matchWallet.toLocaleString("sv-SE")}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Specialbet</p>
              <p className="font-semibold tabular-nums">
                {specialWallet.toLocaleString("sv-SE")}
              </p>
            </div>
          </div>
        </section>

        {/* ── Aktiva slip ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Aktiva slip</h2>
            <Link href="/mina-bet" className="text-xs text-blue-600">
              Visa alla →
            </Link>
          </div>

          {openSlips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center">
              <p className="text-sm text-gray-400">Inga öppna eller låsta slip</p>
              <Link
                href="/bet"
                className="mt-2 inline-block text-xs font-medium text-blue-600"
              >
                Lägg ett slip →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {openSlips.slice(0, 3).map((slip) => (
                <div
                  key={slip.id}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        slip.status === "open"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {slip.status === "open" ? "Öppen" : "Låst"}
                    </span>
                    <span className="text-xs text-gray-500">
                      Insats{" "}
                      <strong className="tabular-nums text-gray-800">
                        {slip.stake.toLocaleString("sv-SE")}
                      </strong>
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums">
                    Möjlig{" "}
                    <strong className="text-gray-700">
                      {slip.potential_payout.toLocaleString("sv-SE")}
                    </strong>
                  </span>
                </div>
              ))}
              {openSlips.length > 3 && (
                <p className="text-center text-xs text-gray-400">
                  +{openSlips.length - 3} till —{" "}
                  <Link href="/mina-bet" className="text-blue-600">
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
            <h2 className="text-sm font-semibold text-gray-700">Nästa matcher</h2>
            <Link href="/matcher" className="text-xs text-blue-600">
              Alla matcher →
            </Link>
          </div>

          {nextMatches.length === 0 ? (
            <p className="px-1 text-sm text-gray-400">Inga kommande matcher.</p>
          ) : (
            <div className="space-y-2">
              {nextMatches.map((m, i) => (
                <Link
                  key={m.id}
                  href="/bet"
                  className={`flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm transition-colors hover:bg-gray-50 ${
                    i === 0 ? "border-blue-200" : "border-gray-100"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {m.home_team?.flag_emoji} {m.home_team?.short_name ?? "?"}&nbsp;–&nbsp;
                      {m.away_team?.flag_emoji} {m.away_team?.short_name ?? "?"}
                    </p>
                    <p className="text-xs text-gray-400">{swDateTime(m.scheduled_at)}</p>
                  </div>
                  {i === 0 && (
                    <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                      Spela →
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── Specialbet-status ─────────────────────────────────────────────── */}
        {marketsTotal > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Specialbet</h2>
              <Link href="/specialbet" className="text-xs text-blue-600">
                Hantera →
              </Link>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex justify-around">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">
                    {marketsWithBet}
                    <span className="text-base font-normal text-gray-400">
                      /{marketsTotal}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Marknader satta</p>
                </div>
                <div className="w-px bg-gray-100" />
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">
                    {specialStaked.toLocaleString("sv-SE")}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Insatt av {specialWallet.toLocaleString("sv-SE")}
                  </p>
                </div>
              </div>

              {marketsMissing > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {marketsMissing === 1
                    ? "1 marknad saknar bet ännu"
                    : `${marketsMissing} marknader saknar bet ännu`}
                </p>
              )}

              {marketsWithBet === marketsTotal && marketsTotal > 0 && (
                <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                  Alla marknader är satta ✓
                </p>
              )}
            </div>
          </section>
        )}

      </div>
    </>
  );
}
