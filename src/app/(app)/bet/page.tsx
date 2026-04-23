import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { BetPage } from "./_components/BetPage";
import type { MatchWithTeamsAndOdds, MatchOdds, BetOutcome } from "@/types";
import type { LocalSelection } from "./_components/SlipPanel";

export default async function BetPageRoute(props: {
  searchParams: Promise<{ amend?: string }>;
}) {
  const { supabase, user } = await requireActiveUser();
  const { amend: amendId } = await props.searchParams;

  const [matchesRes, memberRes] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), odds:match_odds(*)"
      )
      .eq("status", "scheduled")
      .order("scheduled_at"),

    supabase
      .from("league_members")
      .select("id, match_wallet")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single(),
  ]);

  type RawMatch = MatchWithTeamsAndOdds & { odds: MatchOdds[] | MatchOdds | null };
  const rawMatches = (matchesRes.data ?? []) as unknown as RawMatch[];

  const matches: MatchWithTeamsAndOdds[] = rawMatches.map((m) => ({
    ...m,
    odds: Array.isArray(m.odds) ? (m.odds[0] ?? null) : m.odds,
  }));

  const matchWallet  = memberRes.data?.match_wallet ?? 0;
  const memberId     = memberRes.data?.id;

  // ── Amend mode: pre-fill from old slip ───────────────────────────────────────
  let prefilledSelections: LocalSelection[] | undefined;
  let prefilledStake:      number | undefined;
  let validAmendId:        string | undefined;

  if (amendId && memberId) {
    const { data: oldSlip } = await supabase
      .from("bet_slips")
      .select(
        "id, stake, status, league_member_id, selections:bet_slip_selections(match_id, outcome)"
      )
      .eq("id", amendId)
      .single();

    // Only pre-fill if the slip is open AND belongs to the current user
    if (oldSlip?.status === "open" && oldSlip.league_member_id === memberId) {
      // Build a lookup from matchId → current match odds
      const oddsMap = new Map(
        matches
          .filter((m) => m.odds !== null)
          .map((m) => [m.id, m.odds!])
      );

      const sels = (
        oldSlip.selections as Array<{ match_id: string; outcome: string }>
      )
        .map((sel) => {
          const odds = oddsMap.get(sel.match_id);
          if (!odds) return null; // match no longer bettable
          const outcome = sel.outcome as BetOutcome;
          const oddsSnapshot =
            outcome === "home" ? Number(odds.home_odds)
            : outcome === "draw" ? Number(odds.draw_odds)
            : Number(odds.away_odds);
          return { matchId: sel.match_id, outcome, oddsSnapshot } satisfies LocalSelection;
        })
        .filter((s): s is LocalSelection => s !== null);

      if (sels.length > 0) {
        prefilledSelections = sels;
        prefilledStake      = oldSlip.stake;
        validAmendId        = amendId;
      }
    }
  }

  const isAmendMode = validAmendId !== undefined;

  return (
    <>
      <TopBar title={isAmendMode ? "Ändra slip" : "Spela"} />
      <BetPage
        matches={matches}
        matchWallet={matchWallet}
        amendSlipId={validAmendId}
        prefilledSelections={prefilledSelections}
        prefilledStake={prefilledStake}
      />
    </>
  );
}
