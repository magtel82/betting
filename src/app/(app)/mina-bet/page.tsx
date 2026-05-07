import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { SlipsView } from "./_components/SlipsView";
import type { SlipRow } from "./_components/SlipCard";

export default async function MinaBetPage(props: {
  searchParams: Promise<{ placed?: string }>;
}) {
  const { supabase, user } = await requireActiveUser();
  const { placed: newSlipId } = await props.searchParams;

  // Fetch all slips in the user's league — RLS enforces league membership,
  // so only slips from the same league are returned.
  // All slips include selections with match + team details for display.
  const { data: rawSlips } = await supabase
    .from("bet_slips")
    .select(
      [
        "id, league_member_id, stake, combined_odds, potential_payout,",
        "status, placed_at, locked_at, settled_at,",
        "member:league_members(user_id, profile:profiles(display_name)),",
        "selections:bet_slip_selections(",
        "  id, outcome, odds_snapshot, status,",
        "  match:matches(",
        "    id, match_number, stage, group_letter, scheduled_at,",
        "    home_team:teams!matches_home_team_id_fkey(short_name, flag_emoji),",
        "    away_team:teams!matches_away_team_id_fkey(short_name, flag_emoji)",
        "  )",
        ")",
      ].join("")
    )
    .order("placed_at", { ascending: false });

  // Supabase returns member as object (many-to-one) and selections as array.
  // Cast through unknown to detach from inferred type, then normalise member.
  type RawSlip = Omit<SlipRow, "member"> & {
    member: SlipRow["member"] | SlipRow["member"][];
  };

  const slips: SlipRow[] = ((rawSlips ?? []) as unknown as RawSlip[]).map(
    (s) => ({
      ...s,
      member: Array.isArray(s.member) ? (s.member[0] ?? null) : s.member,
    })
  );

  return (
    <>
      <TopBar title="Mina bet" />
      <SlipsView slips={slips} currentUserId={user.id} newSlipId={newSlipId} />
    </>
  );
}
