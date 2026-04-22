// ─── Group standings calculator ───────────────────────────────────────────────
// Computes group-stage standings from teams and finished matches stored in our DB.
// Only matches with status='finished' are counted. Void, live, and scheduled
// matches do not affect the table.
//
// Sort order within each group:
//   1. Points (desc)
//   2. Goal difference (desc)
//   3. Goals for (desc)
//   4. Short name alphabetically (stable MVP tiebreaker; real FIFA uses
//      head-to-head results which are not implemented in MVP)

import type { Team, Match } from "@/types";

export interface TeamStanding {
  teamId:    string;
  name:      string;
  shortName: string;
  flag:      string | null;
  played:    number;
  won:       number;
  drawn:     number;
  lost:      number;
  gf:        number;
  ga:        number;
  gd:        number;
  points:    number;
}

type PartialTeam  = Pick<Team,  "id" | "name" | "short_name" | "flag_emoji" | "group_letter">;
type PartialMatch = Pick<Match, "id" | "status" | "home_team_id" | "away_team_id" | "home_score" | "away_score">;

export function computeGroupStandings(
  teams:   PartialTeam[],
  matches: PartialMatch[],
): Record<string, TeamStanding[]> {
  // Initialise a standing row for every team that has a group letter
  const standingMap = new Map<string, TeamStanding>();
  for (const t of teams) {
    if (!t.group_letter) continue;
    standingMap.set(t.id, {
      teamId:    t.id,
      name:      t.name,
      shortName: t.short_name,
      flag:      t.flag_emoji,
      played:    0,
      won:       0,
      drawn:     0,
      lost:      0,
      gf:        0,
      ga:        0,
      gd:        0,
      points:    0,
    });
  }

  // Accumulate results from finished matches
  for (const m of matches) {
    if (m.status !== "finished") continue;
    if (m.home_score === null || m.away_score === null) continue;
    if (!m.home_team_id || !m.away_team_id) continue;

    const home = standingMap.get(m.home_team_id);
    const away = standingMap.get(m.away_team_id);
    if (!home || !away) continue;

    const hg = m.home_score;
    const ag = m.away_score;

    home.played++;
    away.played++;
    home.gf += hg;
    home.ga += ag;
    away.gf += ag;
    away.ga += hg;

    if (hg > ag) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (hg < ag) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      home.points++;
      away.drawn++;
      away.points++;
    }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  // Bucket teams by group letter
  const groups: Record<string, TeamStanding[]> = {};
  for (const t of teams) {
    const letter = t.group_letter;
    if (!letter) continue;
    const s = standingMap.get(t.id);
    if (!s) continue;
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(s);
  }

  // Sort within each group
  for (const standings of Object.values(groups)) {
    standings.sort((a, b) => {
      if (b.points    !== a.points)    return b.points    - a.points;
      if (b.gd        !== a.gd)        return b.gd        - a.gd;
      if (b.gf        !== a.gf)        return b.gf        - a.gf;
      return a.shortName.localeCompare(b.shortName);
    });
  }

  return groups;
}
