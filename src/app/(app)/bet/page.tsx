import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { BetPage } from "./_components/BetPage";
import type { MatchWithTeamsAndOdds, MatchOdds } from "@/types";

export default async function BetPageRoute() {
  const { supabase, user } = await requireActiveUser();

  const [matchesRes, memberRes] = await Promise.all([
    // Fetch all scheduled matches with teams and current odds.
    // The client further filters to those not yet started (scheduled_at > now()).
    supabase
      .from("matches")
      .select(
        "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), odds:match_odds(*)"
      )
      .eq("status", "scheduled")
      .order("scheduled_at"),

    // Fetch current match_wallet for stake-limit display
    supabase
      .from("league_members")
      .select("match_wallet")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single(),
  ]);

  // Supabase returns the match_odds join as an array even with a unique constraint
  type RawMatch = MatchWithTeamsAndOdds & { odds: MatchOdds[] | MatchOdds | null };
  const rawMatches = (matchesRes.data ?? []) as unknown as RawMatch[];

  const matches: MatchWithTeamsAndOdds[] = rawMatches.map((m) => ({
    ...m,
    odds: Array.isArray(m.odds) ? (m.odds[0] ?? null) : m.odds,
  }));

  const matchWallet = memberRes.data?.match_wallet ?? 0;

  return (
    <>
      <TopBar title="Spela" />
      <BetPage matches={matches} matchWallet={matchWallet} />
    </>
  );
}
