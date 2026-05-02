// ─── Team name normalisation ──────────────────────────────────────────────────
// Two separate mappings:
//
// TEAM_NAME_TO_SHORT — English API name → 3-letter short_name (used by
//   results sync via football-data.org which returns English names and we
//   match against teams.short_name).
//
// TEAM_NAME_TO_DB — English API name → Swedish full name stored in
//   teams.name (used by odds sync via The Odds API which returns English
//   names and we match against teams.name).
//
// Add new spelling variants by adding extra keys pointing to the same value.

// ─── English → 3-letter short_name ───────────────────────────────────────────

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
export function resolveTeamShortName(apiName: string): string | null {
  const direct = TEAM_NAME_TO_SHORT[apiName];
  if (direct) return direct;
  const lower = apiName.toLowerCase();
  for (const [key, val] of Object.entries(TEAM_NAME_TO_SHORT)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

// ─── English → Swedish DB name (teams.name) ───────────────────────────────────
// Used by odds sync (The Odds API returns English names; DB stores Swedish).

export const TEAM_NAME_TO_DB: Record<string, string> = {
  // ── Grupp A ──────────────────────────────────────────────────────────────
  "USA":                       "USA",
  "United States":             "USA",
  "United States of America":  "USA",
  "Panama":                    "Panama",
  "Albania":                   "Albanien",
  "Ukraine":                   "Ukraina",

  // ── Grupp B ──────────────────────────────────────────────────────────────
  "Argentina":                 "Argentina",
  "Chile":                     "Chile",
  "Peru":                      "Peru",
  "New Zealand":               "Nya Zeeland",

  // ── Grupp C ──────────────────────────────────────────────────────────────
  "Mexico":                    "Mexiko",
  "Jamaica":                   "Jamaica",
  "Venezuela":                 "Venezuela",
  "Honduras":                  "Honduras",

  // ── Grupp D ──────────────────────────────────────────────────────────────
  "Spain":                     "Spanien",
  "Brazil":                    "Brasilien",
  "Japan":                     "Japan",
  "Morocco":                   "Marocko",

  // ── Grupp E ──────────────────────────────────────────────────────────────
  "France":                    "Frankrike",
  "Croatia":                   "Kroatien",
  "Serbia":                    "Serbien",
  "Ecuador":                   "Ecuador",

  // ── Grupp F ──────────────────────────────────────────────────────────────
  "England":                   "England",
  "Colombia":                  "Colombia",
  "Senegal":                   "Senegal",
  "Paraguay":                  "Paraguay",

  // ── Grupp G ──────────────────────────────────────────────────────────────
  "Germany":                   "Tyskland",
  "Portugal":                  "Portugal",
  "South Korea":               "Sydkorea",
  "Korea Republic":            "Sydkorea",
  "Republic of Korea":         "Sydkorea",
  "Costa Rica":                "Costa Rica",

  // ── Grupp H ──────────────────────────────────────────────────────────────
  "Netherlands":               "Nederländerna",
  "Uruguay":                   "Uruguay",
  "Nigeria":                   "Nigeria",
  "Austria":                   "Österrike",

  // ── Grupp I ──────────────────────────────────────────────────────────────
  "Sweden":                    "Sverige",
  "Switzerland":               "Schweiz",
  "Ivory Coast":               "Elfenbenskusten",
  "Côte d'Ivoire":             "Elfenbenskusten",
  "Cote d'Ivoire":             "Elfenbenskusten",
  "Australia":                 "Australien",

  // ── Grupp J ──────────────────────────────────────────────────────────────
  "Canada":                    "Kanada",
  "Egypt":                     "Egypten",
  "Iran":                      "Iran",
  "IR Iran":                   "Iran",
  "Ghana":                     "Ghana",

  // ── Grupp K ──────────────────────────────────────────────────────────────
  "Italy":                     "Italien",
  "Denmark":                   "Danmark",
  "Turkey":                    "Turkiet",
  "Türkiye":                   "Turkiet",
  "Poland":                    "Polen",

  // ── Grupp L ──────────────────────────────────────────────────────────────
  "Belgium":                   "Belgien",
  "Tunisia":                   "Tunisien",
  "Saudi Arabia":              "Saudiarabien",
  "South Africa":              "Sydafrika",

  // ── Extra lag som API returnerar (ej WC 2026-gruppspel) ──────────────────
  "Czech Republic":            "Tjeckien",
  "Bosnia & Herzegovina":      "Bosnien & Hercegovina",
  "Haiti":                     "Haiti",
  "Scotland":                  "Skottland",
  "Curaçao":                   "Curaçao",
  "Cape Verde":                "Kap Verde",
  "Iraq":                      "Irak",
  "Norway":                    "Norge",
  "Algeria":                   "Algeriet",
  "Jordan":                    "Jordanien",
  "DR Congo":                  "Kongo-Kinshasa",
  "Uzbekistan":                "Uzbekistan",
  "Qatar":                     "Qatar",
  "Kosovo":                    "Kosovo",
};

// Case-insensitive lookup. Returns null and logs a warning if name is unknown.
export function resolveTeamDbName(apiName: string): string | null {
  const direct = TEAM_NAME_TO_DB[apiName];
  if (direct) return direct;
  const lower = apiName.toLowerCase();
  for (const [key, val] of Object.entries(TEAM_NAME_TO_DB)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

// ─── Date matching ────────────────────────────────────────────────────────────

// Returns true if two ISO timestamps are within toleranceMs of each other.
// Used by results sync where both sides have accurate times.
const MATCH_DATE_TOLERANCE_MS = 4 * 60 * 60 * 1000; // 4 hours

export function datesWithinTolerance(a: string, b: string): boolean {
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diff <= MATCH_DATE_TOLERANCE_MS;
}

// Returns true if two ISO timestamps fall on the same UTC calendar date.
// Used by odds sync where the DB has placeholder times but correct dates —
// two teams never meet twice on the same day so date-only matching is safe.
export function sameCalendarDate(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}
