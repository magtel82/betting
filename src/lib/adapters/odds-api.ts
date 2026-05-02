// ─── The Odds API — typed HTTP client ─────────────────────────────────────────
// Docs: https://the-odds-api.com/liveapi/guides/v4/
// Fetches h2h (1x2) odds for WC 2026 matches.

const BASE_URL = "https://api.the-odds-api.com/v4";
export const SPORT_KEY = "soccer_fifa_world_cup";

// ─── Response types ───────────────────────────────────────────────────────────

export interface OddsApiOutcome {
  name:  string;  // team name or "Draw"
  price: number;  // decimal odds
}

export interface OddsApiMarket {
  key:         string;          // "h2h"
  last_update: string;
  outcomes:    OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key:         string;
  title:       string;
  last_update: string;
  markets:     OddsApiMarket[];
}

export interface OddsApiEvent {
  id:            string;
  sport_key:     string;
  commence_time: string;  // ISO 8601 UTC
  home_team:     string;
  away_team:     string;
  bookmakers:    OddsApiBookmaker[];
}

export class OddsApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "OddsApiError";
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export async function fetchOddsForTournament(): Promise<OddsApiEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new OddsApiError(0, "ODDS_API_KEY environment variable is not set");

  const url = new URL(`${BASE_URL}/sports/${SPORT_KEY}/odds/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const debugUrl =
    `${BASE_URL}/sports/${SPORT_KEY}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
  console.log(`[odds-api] fetchOddsForTournament → ${debugUrl}`);

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },   // never cache — always fresh
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `The Odds API returned ${res.status}: ${body}`;
    console.error(`[odds-api] fetchOddsForTournament failed — ${msg}`);
    throw new OddsApiError(res.status, msg);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new OddsApiError(0, "Unexpected response shape from The Odds API");
  }
  console.log(`[odds-api] fetchOddsForTournament → ${data.length} events`);
  return data as OddsApiEvent[];
}

// ─── Sports list (for diagnostics) ───────────────────────────────────────────

export interface OddsApiSport {
  key:           string;
  group:         string;
  title:         string;
  description:   string;
  active:        boolean;
  has_outrights: boolean;
}

export async function fetchAvailableSports(): Promise<{ sports: OddsApiSport[]; debugUrl: string }> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new OddsApiError(0, "ODDS_API_KEY environment variable is not set");

  const url = new URL(`${BASE_URL}/sports/`);
  url.searchParams.set("apiKey", apiKey);
  const debugUrl = `${BASE_URL}/sports/?apiKey=***`;

  console.log(`[odds-api] fetchAvailableSports → ${debugUrl}`);

  const res = await fetch(url.toString(), {
    next: { revalidate: 0 },
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OddsApiError(res.status, `The Odds API returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new OddsApiError(0, "Unexpected response shape from The Odds API sports endpoint");
  }
  return { sports: data as OddsApiSport[], debugUrl };
}

// ─── Odds aggregation ─────────────────────────────────────────────────────────

// Average h2h odds across all bookmakers for one event.
// Returns null if no bookmaker provides a complete h2h market.
export function aggregateH2HOdds(
  event: OddsApiEvent
): { home: number; draw: number; away: number } | null {
  const home_sums: number[] = [];
  const draw_sums: number[] = [];
  const away_sums: number[] = [];

  for (const bm of event.bookmakers) {
    const h2h = bm.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;

    const homeOut = h2h.outcomes.find((o) => o.name === event.home_team);
    const awayOut = h2h.outcomes.find((o) => o.name === event.away_team);
    const drawOut = h2h.outcomes.find((o) => o.name === "Draw");

    if (homeOut && awayOut && drawOut) {
      home_sums.push(homeOut.price);
      draw_sums.push(drawOut.price);
      away_sums.push(awayOut.price);
    }
  }

  if (home_sums.length === 0) return null;

  const avg = (arr: number[]) =>
    Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;

  const home = avg(home_sums);
  const draw = avg(draw_sums);
  const away = avg(away_sums);

  // Guard: all must be > 1.0 to pass DB constraint
  if (home <= 1.0 || draw <= 1.0 || away <= 1.0) return null;

  return { home, draw, away };
}
