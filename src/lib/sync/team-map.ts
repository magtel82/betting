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
// Groups reflect the official FIFA VM 2026 draw.
// Add new spelling variants by adding extra keys pointing to the same value.

// ─── English → 3-letter short_name ───────────────────────────────────────────

export const TEAM_NAME_TO_SHORT: Record<string, string> = {
  // ── Grupp A ──────────────────────────────────────────────────────────────
  "Czech Republic":           "CZE",
  "Czechia":                  "CZE",
  "South Korea":              "KOR",
  "Korea Republic":           "KOR",
  "Republic of Korea":        "KOR",
  "Mexico":                   "MEX",
  "South Africa":             "RSA",

  // ── Grupp B ──────────────────────────────────────────────────────────────
  "Bosnia & Herzegovina":     "BIH",
  "Bosnia and Herzegovina":   "BIH",
  "Canada":                   "CAN",
  "Qatar":                    "QAT",
  "Switzerland":              "SUI",

  // ── Grupp C ──────────────────────────────────────────────────────────────
  "Brazil":                   "BRA",
  "Haiti":                    "HAI",
  "Morocco":                  "MAR",
  "Scotland":                 "SCO",

  // ── Grupp D ──────────────────────────────────────────────────────────────
  "Australia":                "AUS",
  "Paraguay":                 "PAR",
  "Turkey":                   "TUR",
  "Türkiye":                  "TUR",
  "USA":                      "USA",
  "United States":            "USA",
  "United States of America": "USA",

  // ── Grupp E ──────────────────────────────────────────────────────────────
  "Ivory Coast":              "CIV",
  "Côte d'Ivoire":            "CIV",
  "Cote d'Ivoire":            "CIV",
  "Curaçao":                  "CUW",
  "Curacao":                  "CUW",
  "Ecuador":                  "ECU",
  "Germany":                  "GER",

  // ── Grupp F ──────────────────────────────────────────────────────────────
  "Japan":                    "JPN",
  "Netherlands":              "NED",
  "Sweden":                   "SWE",
  "Tunisia":                  "TUN",

  // ── Grupp G ──────────────────────────────────────────────────────────────
  "Belgium":                  "BEL",
  "Egypt":                    "EGY",
  "Iran":                     "IRN",
  "IR Iran":                  "IRN",
  "New Zealand":              "NZL",

  // ── Grupp H ──────────────────────────────────────────────────────────────
  "Cape Verde":               "CPV",
  "Spain":                    "ESP",
  "Saudi Arabia":             "KSA",
  "Uruguay":                  "URU",

  // ── Grupp I ──────────────────────────────────────────────────────────────
  "France":                   "FRA",
  "Iraq":                     "IRQ",
  "Norway":                   "NOR",
  "Senegal":                  "SEN",

  // ── Grupp J ──────────────────────────────────────────────────────────────
  "Algeria":                  "ALG",
  "Argentina":                "ARG",
  "Austria":                  "AUT",
  "Jordan":                   "JOR",

  // ── Grupp K ──────────────────────────────────────────────────────────────
  "DR Congo":                 "COD",
  "Congo DR":                 "COD",
  "Democratic Republic of Congo": "COD",
  "Colombia":                 "COL",
  "Portugal":                 "POR",
  "Uzbekistan":               "UZB",

  // ── Grupp L ──────────────────────────────────────────────────────────────
  "Croatia":                  "CRO",
  "England":                  "ENG",
  "Ghana":                    "GHA",
  "Panama":                   "PAN",
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
  "Czech Republic":            "Tjeckien",
  "Czechia":                   "Tjeckien",
  "South Korea":               "Sydkorea",
  "Korea Republic":            "Sydkorea",
  "Republic of Korea":         "Sydkorea",
  "Mexico":                    "Mexiko",
  "South Africa":              "Sydafrika",

  // ── Grupp B ──────────────────────────────────────────────────────────────
  "Bosnia & Herzegovina":      "Bosnien & Hercegovina",
  "Bosnia and Herzegovina":    "Bosnien & Hercegovina",
  "Canada":                    "Kanada",
  "Qatar":                     "Qatar",
  "Switzerland":               "Schweiz",

  // ── Grupp C ──────────────────────────────────────────────────────────────
  "Brazil":                    "Brasilien",
  "Haiti":                     "Haiti",
  "Morocco":                   "Marocko",
  "Scotland":                  "Skottland",

  // ── Grupp D ──────────────────────────────────────────────────────────────
  "Australia":                 "Australien",
  "Paraguay":                  "Paraguay",
  "Turkey":                    "Turkiet",
  "Türkiye":                   "Turkiet",
  "USA":                       "USA",
  "United States":             "USA",
  "United States of America":  "USA",

  // ── Grupp E ──────────────────────────────────────────────────────────────
  "Ivory Coast":               "Elfenbenskusten",
  "Côte d'Ivoire":             "Elfenbenskusten",
  "Cote d'Ivoire":             "Elfenbenskusten",
  "Curaçao":                   "Curaçao",
  "Curacao":                   "Curaçao",
  "Ecuador":                   "Ecuador",
  "Germany":                   "Tyskland",

  // ── Grupp F ──────────────────────────────────────────────────────────────
  "Japan":                     "Japan",
  "Netherlands":               "Nederländerna",
  "Sweden":                    "Sverige",
  "Tunisia":                   "Tunisien",

  // ── Grupp G ──────────────────────────────────────────────────────────────
  "Belgium":                   "Belgien",
  "Egypt":                     "Egypten",
  "Iran":                      "Iran",
  "IR Iran":                   "Iran",
  "New Zealand":               "Nya Zeeland",

  // ── Grupp H ──────────────────────────────────────────────────────────────
  "Cape Verde":                "Kap Verde",
  "Spain":                     "Spanien",
  "Saudi Arabia":              "Saudiarabien",
  "Uruguay":                   "Uruguay",

  // ── Grupp I ──────────────────────────────────────────────────────────────
  "France":                    "Frankrike",
  "Iraq":                      "Irak",
  "Norway":                    "Norge",
  "Senegal":                   "Senegal",

  // ── Grupp J ──────────────────────────────────────────────────────────────
  "Algeria":                   "Algeriet",
  "Argentina":                 "Argentina",
  "Austria":                   "Österrike",
  "Jordan":                    "Jordanien",

  // ── Grupp K ──────────────────────────────────────────────────────────────
  "DR Congo":                  "Kongo-Kinshasa",
  "Congo DR":                  "Kongo-Kinshasa",
  "Democratic Republic of Congo": "Kongo-Kinshasa",
  "Colombia":                  "Colombia",
  "Portugal":                  "Portugal",
  "Uzbekistan":                "Uzbekistan",

  // ── Grupp L ──────────────────────────────────────────────────────────────
  "Croatia":                   "Kroatien",
  "England":                   "England",
  "Ghana":                     "Ghana",
  "Panama":                    "Panama",

  // ── Extra stavningar som API kan returnera ────────────────────────────────
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
const MATCH_DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000; // 36 h — placeholder times are 12:00 UTC; WC 2026 NA kick-offs reach 02:00 UTC next day

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
