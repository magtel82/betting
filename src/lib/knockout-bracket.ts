// Bracket resolution for VM 2026 knockout stage.
//
// Slot format (slot_home / slot_away in DB):
//   "1A"      = winner of group A
//   "2B"      = runner-up of group B
//   "3top-N"  = N:th best third-placed team ranked by pts/gd/gf/alpha
//   "W73"     = winner of match number 73
//   "L101"    = loser of match number 101 (bronsmatch only)
//
// Teams are resolved in match-number order (ascending) so that
// downstream slots (W89 depends on W73/W74) can always find their sources.
//
// If home_team_id / away_team_id is already set in the DB (admin-entered),
// that takes precedence over slot-derived resolution.

import type { TeamStanding } from "./group-standings";
import type { MatchStage, MatchStatus } from "@/types";

export interface BracketTeam {
  id: string;
  name: string;
  shortName: string;
  flag: string | null;
}

export interface BracketSlot {
  team: BracketTeam | null;
  label: string; // shown when team is still undetermined
}

export interface BracketMatch {
  id: string;
  matchNumber: number;
  stage: MatchStage;
  scheduledAt: string;
  status: MatchStatus;
  home: BracketSlot;
  away: BracketSlot;
  homeScore: number | null;
  awayScore: number | null;
}

export interface RawKnockoutMatch {
  id: string;
  match_number: number;
  stage: MatchStage;
  scheduled_at: string;
  status: MatchStatus;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  slot_home: string | null;
  slot_away: string | null;
}

interface RawTeam {
  id: string;
  name: string;
  short_name: string;
  flag_emoji: string | null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildBracketMatches(
  knockoutMatches: RawKnockoutMatch[],
  teams: RawTeam[],
  groups: Record<string, TeamStanding[]>,
): BracketMatch[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rawByNumber = new Map(knockoutMatches.map((m) => [m.match_number, m]));

  // Process in match-number order so W-slot lookups always find resolved entries.
  const sorted = [...knockoutMatches].sort((a, b) => a.match_number - b.match_number);

  // Accumulates resolved teams keyed by match_number for W/L lookups.
  const resolvedByNumber = new Map<number, { home: BracketTeam | null; away: BracketTeam | null }>();

  const results: BracketMatch[] = [];

  for (const m of sorted) {
    const home = resolveTeam(m, "home", teamById, rawByNumber, resolvedByNumber, groups);
    const away = resolveTeam(m, "away", teamById, rawByNumber, resolvedByNumber, groups);

    resolvedByNumber.set(m.match_number, { home, away });

    results.push({
      id: m.id,
      matchNumber: m.match_number,
      stage: m.stage,
      scheduledAt: m.scheduled_at,
      status: m.status,
      home: { team: home, label: slotLabel(m.slot_home) },
      away: { team: away, label: slotLabel(m.slot_away) },
      homeScore: m.home_score,
      awayScore: m.away_score,
    });
  }

  return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveTeam(
  m: RawKnockoutMatch,
  side: "home" | "away",
  teamById: Map<string, RawTeam>,
  rawByNumber: Map<number, RawKnockoutMatch>,
  resolvedByNumber: Map<number, { home: BracketTeam | null; away: BracketTeam | null }>,
  groups: Record<string, TeamStanding[]>,
): BracketTeam | null {
  const dbId = side === "home" ? m.home_team_id : m.away_team_id;
  if (dbId) {
    const t = teamById.get(dbId);
    return t ? toTeam(t) : null;
  }
  const slot = side === "home" ? m.slot_home : m.slot_away;
  return resolveSlot(slot, groups, rawByNumber, resolvedByNumber);
}

function resolveSlot(
  slot: string | null,
  groups: Record<string, TeamStanding[]>,
  rawByNumber: Map<number, RawKnockoutMatch>,
  resolvedByNumber: Map<number, { home: BracketTeam | null; away: BracketTeam | null }>,
): BracketTeam | null {
  if (!slot) return null;

  // Group position: "1A", "2B", "3C"
  const grpPos = slot.match(/^([123])([A-L])$/);
  if (grpPos) {
    const idx = parseInt(grpPos[1]) - 1;
    const standing = groups[grpPos[2]]?.[idx];
    if (!standing) return null;
    return { id: standing.teamId, name: standing.name, shortName: standing.shortName, flag: standing.flag };
  }

  // Winner: "W73"
  const win = slot.match(/^W(\d+)$/);
  if (win) {
    const num = parseInt(win[1]);
    return pickResult(num, "winner", rawByNumber, resolvedByNumber);
  }

  // Loser: "L101"
  const lose = slot.match(/^L(\d+)$/);
  if (lose) {
    const num = parseInt(lose[1]);
    return pickResult(num, "loser", rawByNumber, resolvedByNumber);
  }

  // Third-place top-N: "3top-1" through "3top-8"
  const third = slot.match(/^3top-(\d+)$/);
  if (third) {
    return topThird(groups, parseInt(third[1]) - 1);
  }

  return null;
}

function pickResult(
  matchNum: number,
  pick: "winner" | "loser",
  rawByNumber: Map<number, RawKnockoutMatch>,
  resolvedByNumber: Map<number, { home: BracketTeam | null; away: BracketTeam | null }>,
): BracketTeam | null {
  const raw = rawByNumber.get(matchNum);
  if (!raw || raw.status !== "finished") return null;
  if (raw.home_score === null || raw.away_score === null) return null;
  if (raw.home_score === raw.away_score) return null; // penalties → admin sets team_id

  const resolved = resolvedByNumber.get(matchNum);
  if (!resolved) return null;

  const homeWon = raw.home_score > raw.away_score;
  if (pick === "winner") return homeWon ? resolved.home : resolved.away;
  return homeWon ? resolved.away : resolved.home;
}

function topThird(groups: Record<string, TeamStanding[]>, zeroIdx: number): BracketTeam | null {
  const thirds = Object.values(groups)
    .map((s) => s[2])
    .filter(Boolean) as TeamStanding[];

  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gd     !== a.gd)     return b.gd     - a.gd;
    if (b.gf     !== a.gf)     return b.gf     - a.gf;
    return a.shortName.localeCompare(b.shortName);
  });

  const t = thirds[zeroIdx];
  if (!t) return null;
  return { id: t.teamId, name: t.name, shortName: t.shortName, flag: t.flag };
}

function toTeam(t: RawTeam): BracketTeam {
  return { id: t.id, name: t.name, shortName: t.short_name, flag: t.flag_emoji ?? null };
}

function slotLabel(slot: string | null): string {
  if (!slot) return "TBD";

  const grpPos = slot.match(/^([123])([A-L])$/);
  if (grpPos) {
    const pos = grpPos[1] === "1" ? "Etta" : grpPos[1] === "2" ? "Tvåa" : "Trea";
    return `${pos} grupp ${grpPos[2]}`;
  }

  const win = slot.match(/^W(\d+)$/);
  if (win) return `Vinnare M${win[1]}`;

  const lose = slot.match(/^L(\d+)$/);
  if (lose) return `Förlorare M${lose[1]}`;

  if (/^3top-\d+$/.test(slot)) return "Bäste 3:a";

  return "TBD";
}
