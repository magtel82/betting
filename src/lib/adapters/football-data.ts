// ─── football-data.org — typed HTTP client ────────────────────────────────────
// Docs: https://www.football-data.org/documentation/quickstart
// Used to fetch match schedules and live/final results for WC 2026.

const BASE_URL = "https://api.football-data.org/v4";

// FIFA World Cup competition ID on football-data.org (same ID across editions)
const DEFAULT_COMPETITION_ID = parseInt(
  process.env.FOOTBALL_DATA_COMPETITION_ID ?? "2000",
  10
);

// ─── Response types ───────────────────────────────────────────────────────────

export interface FDTeam {
  id:        number;
  name:      string;
  shortName: string;
  tla:       string;       // 3-letter abbreviation, e.g. "GER"
  crest:     string;
}

export interface FDScore {
  winner:   "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}

// football-data.org status values we care about
export type FDMatchStatus =
  | "TIMED"
  | "SCHEDULED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "SUSPENDED";

export interface FDMatch {
  id:          number;       // External match ID (their system)
  utcDate:     string;       // ISO 8601 UTC kick-off time
  status:      FDMatchStatus;
  matchday:    number | null;
  stage:       string;       // "GROUP_STAGE", "ROUND_OF_16", etc.
  group:       string | null;// "GROUP_A", etc.
  homeTeam:    FDTeam;
  awayTeam:    FDTeam;
  score:       FDScore;
}

interface FDMatchesResponse {
  count:   number;
  matches: FDMatch[];
}

export class FootballDataError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export async function fetchMatchesForTournament(
  competitionId = DEFAULT_COMPETITION_ID
): Promise<FDMatch[]> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    throw new FootballDataError(0, "FOOTBALL_DATA_API_KEY environment variable is not set");
  }

  const url = `${BASE_URL}/competitions/${competitionId}/matches`;

  const res = await fetch(url, {
    next: { revalidate: 0 },
    headers: {
      "X-Auth-Token": apiKey,
      "Accept":       "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new FootballDataError(res.status, `football-data.org returned ${res.status}: ${body}`);
  }

  const data: FDMatchesResponse = await res.json();
  if (!Array.isArray(data.matches)) {
    throw new FootballDataError(0, "Unexpected response shape from football-data.org");
  }
  return data.matches;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

// Maps football-data.org status → our internal MatchStatus.
// POSTPONED is treated as scheduled; admin can void manually if needed.
export const FD_STATUS_MAP: Record<FDMatchStatus, "scheduled" | "live" | "finished" | "void"> = {
  TIMED:      "scheduled",
  SCHEDULED:  "scheduled",
  IN_PLAY:    "live",
  PAUSED:     "live",       // half-time break
  FINISHED:   "finished",
  POSTPONED:  "scheduled",
  CANCELLED:  "void",
  SUSPENDED:  "void",
};
