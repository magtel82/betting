import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { computeGroupStandings } from "@/lib/group-standings";
import { GroupsView } from "./_components/GroupsView";
import type { Team, Match } from "@/types";

export default async function GrupperPage() {
  const { supabase } = await requireActiveUser();

  const [teamsRes, matchesRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name, flag_emoji, group_letter")
      .not("group_letter", "is", null)
      .order("group_letter")
      .order("name"),

    supabase
      .from("matches")
      .select("id, status, home_team_id, away_team_id, home_score, away_score, group_letter")
      .eq("stage", "group"),
  ]);

  type TeamRow  = Pick<Team,  "id" | "name" | "short_name" | "flag_emoji" | "group_letter">;
  type MatchRow = Pick<Match, "id" | "status" | "home_team_id" | "away_team_id" | "home_score" | "away_score"> & { group_letter: string | null };

  const teams   = (teamsRes.data   ?? []) as TeamRow[];
  const matches = (matchesRes.data ?? []) as MatchRow[];

  const groups = computeGroupStandings(teams, matches);

  // Count finished and total matches per group for the footer
  const finishedByGroup: Record<string, number> = {};
  const totalByGroup:    Record<string, number> = {};

  for (const m of matches) {
    const l = m.group_letter;
    if (!l) continue;
    if (!totalByGroup[l])    totalByGroup[l]    = 0;
    if (!finishedByGroup[l]) finishedByGroup[l] = 0;
    totalByGroup[l]++;
    if (m.status === "finished") finishedByGroup[l]++;
  }

  return (
    <>
      <TopBar title="Grupper" />
      <GroupsView
        groups={groups}
        finishedByGroup={finishedByGroup}
        totalByGroup={totalByGroup}
      />
    </>
  );
}
