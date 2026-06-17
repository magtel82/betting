import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { computeGroupStandings } from "@/lib/group-standings";
import { buildBracketMatches } from "@/lib/knockout-bracket";
import { GroupsView } from "./_components/GroupsView";
import type { GroupMatch } from "./_components/GroupMatches";
import type { Team, Match } from "@/types";

export default async function GrupperPage() {
  const { supabase } = await requireActiveUser();

  const [teamsRes, groupMatchesRes, knockoutMatchesRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_name, flag_code, group_letter")
      .order("group_letter")
      .order("name"),

    supabase
      .from("matches")
      .select("id, match_number, status, scheduled_at, home_team_id, away_team_id, home_score, away_score, group_letter")
      .eq("stage", "group")
      .order("match_number"),

    supabase
      .from("matches")
      .select("id, match_number, stage, scheduled_at, status, home_team_id, away_team_id, home_score, away_score, slot_home, slot_away")
      .in("stage", ["r32", "r16", "qf", "sf", "3rd_place", "final"])
      .order("match_number"),
  ]);

  type TeamRow        = Pick<Team, "id" | "name" | "short_name" | "flag_code" | "group_letter">;
  type GroupMatchRow  = Pick<Match, "id" | "match_number" | "status" | "scheduled_at" | "home_team_id" | "away_team_id" | "home_score" | "away_score"> & { group_letter: string | null };

  const teams         = (teamsRes.data          ?? []) as TeamRow[];
  const groupMatches  = (groupMatchesRes.data    ?? []) as GroupMatchRow[];
  const knockoutRaw   = (knockoutMatchesRes.data ?? []) as Array<{
    id: string;
    match_number: number;
    stage: string;
    scheduled_at: string;
    status: string;
    home_team_id: string | null;
    away_team_id: string | null;
    home_score: number | null;
    away_score: number | null;
    slot_home: string | null;
    slot_away: string | null;
  }>;

  // Group standings (used both for group tables and bracket resolution)
  const groupTeams = teams.filter((t) => t.group_letter !== null);
  const groups = computeGroupStandings(groupTeams, groupMatches);

  // Match counts per group for footer + match list per group
  const finishedByGroup: Record<string, number> = {};
  const totalByGroup:    Record<string, number> = {};
  const matchesByGroup:  Record<string, GroupMatch[]> = {};
  const teamById = new Map(teams.map((t) => [t.id, t]));

  for (const m of groupMatches) {
    const l = m.group_letter;
    if (!l) continue;
    totalByGroup[l]    = (totalByGroup[l]    ?? 0) + 1;
    finishedByGroup[l] = (finishedByGroup[l] ?? 0) + (m.status === "finished" ? 1 : 0);

    const home = m.home_team_id ? teamById.get(m.home_team_id) : undefined;
    const away = m.away_team_id ? teamById.get(m.away_team_id) : undefined;
    (matchesByGroup[l] ??= []).push({
      id:          m.id,
      status:      m.status,
      homeFlag:    home?.flag_code ?? null,
      homeName:    home?.name ?? "TBD",
      awayFlag:    away?.flag_code ?? null,
      awayName:    away?.name ?? "TBD",
      homeScore:   m.home_score,
      awayScore:   m.away_score,
      scheduledAt: m.scheduled_at,
    });
  }

  // Bracket matches with resolved teams
  const bracketMatches = buildBracketMatches(
    knockoutRaw as Parameters<typeof buildBracketMatches>[0],
    teams,
    groups,
  );

  return (
    <>
      <TopBar title="Grupper" />
      <GroupsView
        groups={groups}
        finishedByGroup={finishedByGroup}
        totalByGroup={totalByGroup}
        matchesByGroup={matchesByGroup}
        bracketMatches={bracketMatches}
      />
    </>
  );
}
