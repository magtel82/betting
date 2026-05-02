// ─── Odds sync ────────────────────────────────────────────────────────────────
// Fetches h2h odds from The Odds API and upserts into match_odds.
//
// Idempotency: match_odds has unique(match_id). Every run upserts — running
// multiple times with the same source data produces the same DB state.
//
// Admin protection: source='admin' rows are NEVER overwritten by API sync.
// Admin-set odds serve as an explicit override and remain until admin changes
// them manually. Only rows with source='api' or no existing row are updated.
//
// Matching strategy:
//   For each API event, resolve home/away teams to internal short_names,
//   then find the matching internal match by short_name pair + date window.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchOddsForTournament,
  aggregateH2HOdds,
  OddsApiError,
  type OddsApiEvent,
} from "@/lib/adapters/odds-api";
import { resolveTeamShortName, datesWithinTolerance } from "./team-map";
import { emptySyncResult, type SyncResult } from "./types";

interface InternalMatch {
  id:           string;
  scheduled_at: string;
  status:       string;
  home_short:   string | null;   // resolved from home_team join
  away_short:   string | null;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncOdds(): Promise<SyncResult> {
  const result = emptySyncResult("the-odds-api");
  const db = createAdminClient();

  // 1. Fetch all scheduled/live matches with team short names
  const { data: matches, error: matchErr } = await db
    .from("matches")
    .select("id, scheduled_at, status, home_team:teams!matches_home_team_id_fkey(short_name), away_team:teams!matches_away_team_id_fkey(short_name)")
    .in("status", ["scheduled", "live"]);

  if (matchErr || !matches) {
    const detail = matchErr
      ? `message="${matchErr.message}" code="${matchErr.code}" hint="${matchErr.hint ?? ""}" details="${matchErr.details ?? ""}"`
      : "no data returned";
    console.error("[sync/odds] DB read failed:", detail);
    result.errors.push(`DB read failed: ${matchErr?.message ?? "no data"} (code=${matchErr?.code ?? "?"}, hint=${matchErr?.hint ?? ""})`);
    return result;
  }

  // Flatten the join for easy lookup
  const internalMatches: InternalMatch[] = (matches as unknown as Array<{
    id: string;
    scheduled_at: string;
    status: string;
    home_team: { short_name: string } | null;
    away_team: { short_name: string } | null;
  }>).map((m) => ({
    id:           m.id,
    scheduled_at: m.scheduled_at,
    status:       m.status,
    home_short:   m.home_team?.short_name ?? null,
    away_short:   m.away_team?.short_name ?? null,
  }));

  // 2. Fetch match_ids where admin has set odds — skip these during sync
  const { data: adminOddsRows } = await db
    .from("match_odds")
    .select("match_id")
    .eq("source", "admin");

  const adminLockedIds = new Set(
    (adminOddsRows ?? []).map((r) => r.match_id as string)
  );

  // 3. Fetch odds from API
  let events: OddsApiEvent[];
  try {
    events = await fetchOddsForTournament();
  } catch (err) {
    const msg = err instanceof OddsApiError ? err.message : String(err);
    result.errors.push(`API fetch failed: ${msg}`);
    return result;
  }

  result.processed = events.length;

  // 4. Process each event
  for (const event of events) {
    const homeShort = resolveTeamShortName(event.home_team);
    const awayShort = resolveTeamShortName(event.away_team);

    if (!homeShort || !awayShort) {
      result.errors.push(
        `Unknown team names: "${event.home_team}" / "${event.away_team}"`
      );
      result.skipped++;
      continue;
    }

    // Find matching internal match
    const internalMatch = internalMatches.find(
      (m) =>
        m.home_short === homeShort &&
        m.away_short === awayShort &&
        datesWithinTolerance(m.scheduled_at, event.commence_time)
    );

    if (!internalMatch) {
      result.errors.push(
        `No internal match for ${homeShort} vs ${awayShort} at ${event.commence_time}`
      );
      result.skipped++;
      continue;
    }

    // Skip matches where admin has set odds manually
    if (adminLockedIds.has(internalMatch.id)) {
      result.skipped++;
      continue;
    }

    // Aggregate odds from bookmakers
    const odds = aggregateH2HOdds(event);
    if (!odds) {
      result.skipped++;
      continue;
    }

    // Upsert into match_odds (source='api', set_by=null for automated runs)
    const { error: upsertErr } = await db
      .from("match_odds")
      .upsert(
        {
          match_id:  internalMatch.id,
          home_odds: odds.home,
          draw_odds: odds.draw,
          away_odds: odds.away,
          source:    "api",
          set_by:    null,
        },
        { onConflict: "match_id" }
      );

    if (upsertErr) {
      result.errors.push(
        `DB upsert failed for match ${internalMatch.id}: ${upsertErr.message}`
      );
      result.skipped++;
      continue;
    }

    result.updated++;
  }

  return result;
}
