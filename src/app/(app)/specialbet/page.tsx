import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { SpecialbetPage } from "./_components/SpecialbetPage";
import type { OtherBetEntry } from "./_components/SpecialbetPage";
import type { SpecialMarket, SpecialBet } from "@/types";

export default async function SpecialbetRoute() {
  const { supabase, user } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, special_wallet, league_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return (
      <>
        <TopBar title="Specialbet" />
        <div className="mx-auto max-w-lg px-4 py-6">
          <p className="text-gray-500">Du är inte med i någon liga ännu.</p>
        </div>
      </>
    );
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("tournament_id")
    .eq("id", member.league_id)
    .single();

  const tournamentId = league?.tournament_id as string | undefined;

  const [tournamentRes, marketsRes, betsRes] = await Promise.all([
    tournamentId
      ? supabase.from("tournaments").select("special_bets_deadline").eq("id", tournamentId).single()
      : Promise.resolve({ data: null }),
    tournamentId
      ? supabase.from("special_markets").select("*").eq("tournament_id", tournamentId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("special_bets")
      .select("*")
      .eq("league_member_id", member.id)
      .eq("status", "active"),
  ]);

  const deadline =
    (tournamentRes.data as { special_bets_deadline: string | null } | null)
      ?.special_bets_deadline ?? null;

  const isAdmin = member.role === "admin";
  const deadlinePassed = deadline != null && new Date() >= new Date(deadline);
  const shouldReveal = isAdmin || deadlinePassed;

  const markets = (marketsRes.data ?? []) as SpecialMarket[];

  // ── Reveal: load other members' active bets after deadline (or for admin) ──
  let othersReveal: OtherBetEntry[] | null = null;

  if (shouldReveal) {
    const { data: otherMembers } = await supabase
      .from("league_members")
      .select("id, user_id")
      .eq("league_id", member.league_id)
      .eq("is_active", true)
      .neq("id", member.id);

    if (otherMembers && otherMembers.length > 0) {
      const otherMemberIds = otherMembers.map((m) => m.id);
      const otherUserIds   = otherMembers.map((m) => m.user_id);

      const [otherBetsRes, profilesRes] = await Promise.all([
        supabase
          .from("special_bets")
          .select("*")
          .in("league_member_id", otherMemberIds)
          .eq("status", "active"),
        supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", otherUserIds),
      ]);

      const profileMap = new Map(
        (profilesRes.data ?? []).map((p) => [p.id, p.display_name as string]),
      );
      const memberPlayerMap = new Map(
        otherMembers.map((m) => [m.id, profileMap.get(m.user_id) ?? "Okänd"]),
      );
      const marketMap = new Map(markets.map((m) => [m.id, m]));

      othersReveal = (otherBetsRes.data ?? []).map((bet) => {
        const market = marketMap.get(bet.market_id as string);
        const isFixed = market?.type === "sverige_mal";
        return {
          playerName:      memberPlayerMap.get(bet.league_member_id as string) ?? "Okänd",
          marketId:        bet.market_id as string,
          marketType:      (market?.type ?? "vm_vinnare") as OtherBetEntry["marketType"],
          marketLabel:     market?.label ?? "",
          selectionText:   bet.selection_text as string,
          stake:           bet.stake as number,
          oddsSnapshot:    bet.odds_snapshot as number,
          potentialPayout: bet.potential_payout as number,
          status:          bet.status as OtherBetEntry["status"],
          isFixed,
        };
      });
    } else {
      othersReveal = [];
    }
  }

  return (
    <>
      <TopBar title="Specialbet" />
      <SpecialbetPage
        specialWallet={member.special_wallet}
        deadline={deadline}
        deadlinePassed={deadlinePassed}
        isAdmin={isAdmin}
        markets={markets}
        activeBets={(betsRes.data ?? []) as SpecialBet[]}
        othersReveal={othersReveal}
      />
    </>
  );
}
