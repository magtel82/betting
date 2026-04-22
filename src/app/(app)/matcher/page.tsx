import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { MatchSchedule } from "./_components/MatchSchedule";
import type { MatchWithTeamsAndOdds, MatchOdds } from "@/types";

export default async function MatcherPage() {
  const { supabase } = await requireActiveUser();

  const { data: raw } = await supabase
    .from("matches")
    .select(
      [
        "*",
        "home_team:teams!matches_home_team_id_fkey(*)",
        "away_team:teams!matches_away_team_id_fkey(*)",
        "odds:match_odds(*)",
      ].join(", ")
    )
    .order("scheduled_at");

  // Supabase returns the match_odds join as an array even with a unique constraint.
  // Cast through unknown to detach from the inferred join type, then normalise.
  type RawMatch = MatchWithTeamsAndOdds & { odds: MatchOdds[] | MatchOdds | null };
  const rawMatches = (raw ?? []) as unknown as RawMatch[];

  const matches: MatchWithTeamsAndOdds[] = rawMatches.map((m) => ({
    ...m,
    odds: Array.isArray(m.odds) ? (m.odds[0] ?? null) : m.odds,
  }));

  return (
    <>
      <TopBar title="Matcher" />
      <MatchSchedule matches={matches} />
    </>
  );
}
