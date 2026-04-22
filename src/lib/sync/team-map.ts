// ─── Team name normalisation ──────────────────────────────────────────────────
// Maps English API names (The Odds API, football-data.org) → our internal
// short_name (3-letter codes used in the teams table).
//
// Both APIs use English names but with varying spelling conventions.
// The Odds API tends to use "USA", "South Korea" etc.
// football-data.org uses "United States", "Korea Republic" etc.
// We map both to our consistent short_names.
//
// To add a new variation: add a new key pointing to the same short_name value.

export const TEAM_NAME_TO_SHORT: Record<string, string> = {
  // ── Grupp A ──────────────────────────────────────────────────────────────
  "USA":                  "USA",
  "United States":        "USA",
  "United States of America": "USA",
  "Panama":               "PAN",
  "Albania":              "ALB",
  "Ukraine":              "UKR",

  // ── Grupp B ──────────────────────────────────────────────────────────────
  "Argentina":            "ARG",
  "Chile":                "CHI",
  "Peru":                 "PER",
  "New Zealand":          "NZL",

  // ── Grupp C ──────────────────────────────────────────────────────────────
  "Mexico":               "MEX",
  "Jamaica":              "JAM",
  "Venezuela":            "VEN",
  "Honduras":             "HON",

  // ── Grupp D ──────────────────────────────────────────────────────────────
  "Spain":                "ESP",
  "Brazil":               "BRA",
  "Japan":                "JPN",
  "Morocco":              "MAR",

  // ── Grupp E ──────────────────────────────────────────────────────────────
  "France":               "FRA",
  "Croatia":              "CRO",
  "Serbia":               "SRB",
  "Ecuador":              "ECU",

  // ── Grupp F ──────────────────────────────────────────────────────────────
  "England":              "ENG",
  "Colombia":             "COL",
  "Senegal":              "SEN",
  "Paraguay":             "PAR",

  // ── Grupp G ──────────────────────────────────────────────────────────────
  "Germany":              "GER",
  "Portugal":             "POR",
  "South Korea":          "KOR",
  "Korea Republic":       "KOR",
  "Republic of Korea":    "KOR",
  "Costa Rica":           "CRC",

  // ── Grupp H ──────────────────────────────────────────────────────────────
  "Netherlands":          "NED",
  "Uruguay":              "URU",
  "Nigeria":              "NGA",
  "Austria":              "AUT",

  // ── Grupp I ──────────────────────────────────────────────────────────────
  "Sweden":               "SWE",
  "Switzerland":          "SUI",
  "Ivory Coast":          "CIV",
  "Côte d'Ivoire":        "CIV",
  "Cote d'Ivoire":        "CIV",
  "Australia":            "AUS",

  // ── Grupp J ──────────────────────────────────────────────────────────────
  "Canada":               "CAN",
  "Egypt":                "EGY",
  "Iran":                 "IRN",
  "IR Iran":              "IRN",
  "Ghana":                "GHA",

  // ── Grupp K ──────────────────────────────────────────────────────────────
  "Italy":                "ITA",
  "Denmark":              "DEN",
  "Turkey":               "TUR",
  "Türkiye":              "TUR",
  "Poland":               "POL",

  // ── Grupp L ──────────────────────────────────────────────────────────────
  "Belgium":              "BEL",
  "Tunisia":              "TUN",
  "Saudi Arabia":         "KSA",
  "South Africa":         "RSA",
};

// Case-insensitive lookup.
// Returns null if the name is not in the map.
export function resolveTeamShortName(apiName: string): string | null {
  const direct = TEAM_NAME_TO_SHORT[apiName];
  if (direct) return direct;

  const lower = apiName.toLowerCase();
  for (const [key, val] of Object.entries(TEAM_NAME_TO_SHORT)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

// ─── Date-window matching ─────────────────────────────────────────────────────
// Returns true if two ISO date strings are within toleranceMs of each other.
const MATCH_DATE_TOLERANCE_MS = 4 * 60 * 60 * 1000; // 4 hours

export function datesWithinTolerance(a: string, b: string): boolean {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= MATCH_DATE_TOLERANCE_MS;
}
