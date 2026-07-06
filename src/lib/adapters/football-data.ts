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
  // All fields are null for undetermined knockout fixtures (TBD slots).
  id:        number | null;
  name:      string | null;
  shortName: string | null;
  tla:       string | null;       // 3-letter abbreviation, e.g. "GER"
  crest:     string | null;
}

export interface FDScore {
  winner:   "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  // fullTime is the aggregate after all play: for PENALTY_SHOOTOUT it includes
  // the shootout tally (e.g. 7–6), NOT the pre-shootout scoreline.
  fullTime:     { home: number | null; away: number | null };
  halfTime:     { home: number | null; away: number | null };
  // Present only when duration != "REGULAR" — the score after 90 minutes.
  regularTime?: { home: number | null; away: number | null };
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

  // Serverless cold starts intermittently throw "fetch failed" (DNS/TLS hiccup)
  // on the first request. The results cron runs only once daily, so a single
  // transient failure would delay settlement 24h. Retry up to 3 times.
  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, {
        next: { revalidate: 0 },
        headers: {
          "X-Auth-Token": apiKey,
          "Accept":       "application/json",
        },
      });
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  if (!res) {
    throw new FootballDataError(0, `fetch failed after 3 attempts: ${String(lastErr)}`);
  }

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

// Maps football-data.org score.duration → how the match was decided.
export const FD_DURATION_MAP: Record<FDScore["duration"], "regular" | "extra_time" | "penalties"> = {
  REGULAR:           "regular",
  EXTRA_TIME:        "extra_time",
  PENALTY_SHOOTOUT:  "penalties",
};
