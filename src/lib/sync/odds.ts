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
//   For each API event, translate the English team name to the Swedish name
//   stored in teams.name (via TEAM_NAME_TO_DB), then find the matching
//   internal match by (home_name, away_name) + same calendar date (UTC).
//   Time is ignored because the DB may have placeholder kickoff times from
//   seed data. Two teams never meet twice on the same day, so date-only
//   matching is safe. When a match is found the exact kickoff time from the
//   API is written back to matches.scheduled_at so the DB self-corrects.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchOddsForTournament,
  aggregateH2HOdds,
  OddsApiError,
  type OddsApiEvent,
} from "@/lib/adapters/odds-api";
import { resolveTeamDbName, sameCalendarDate } from "./team-map";
import { emptySyncResult, type SyncResult } from "./types";

interface InternalMatch {
  id:           string;
  scheduled_at: string;
  status:       string;
  home_name:    string | null;   // teams.name (Swedish full name)
  away_name:    string | null;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncOdds(): Promise<SyncResult> {
  const result = emptySyncResult("the-odds-api");
  const db = createAdminClient();

  // 1. Fetch all scheduled/live matches with team full names (Swedish)
  const { data: matches, error: matchErr } = await db
    .from("matches")
    .select("id, scheduled_at, status, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)")
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
    home_team: { name: string } | null;
    away_team: { name: string } | null;
  }>).map((m) => ({
    id:           m.id,
    scheduled_at: m.scheduled_at,
    status:       m.status,
    home_name:    m.home_team?.name ?? null,
    away_name:    m.away_team?.name ?? null,
  }));

  console.log(`[sync/odds] Loaded ${internalMatches.length} internal matches from DB`);

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
  console.log(`[sync/odds] Fetched ${events.length} events from The Odds API`);

  // Debug: log first 5 events so we can verify name resolution + date shape
  for (const ev of events.slice(0, 5)) {
    const h = resolveTeamDbName(ev.home_team);
    const a = resolveTeamDbName(ev.away_team);
    const dbMatch = internalMatches.find(
      (m) => m.home_name === h && m.away_name === a
    );
    console.log(
      `[sync/odds] SAMPLE api="${ev.home_team}" vs "${ev.away_team}" ` +
      `→ db="${h ?? "??"}" vs "${a ?? "??"}" | api_date=${ev.commence_time.slice(0, 10)} ` +
      `db_date=${dbMatch?.scheduled_at?.slice(0, 10) ?? "(no name match)"}`
    );
  }

  // 4. Process each event
  for (const event of events) {
    const homeDbName = resolveTeamDbName(event.home_team);
    const awayDbName = resolveTeamDbName(event.away_team);

    if (!homeDbName || !awayDbName) {
      const missing = [
        !homeDbName ? `"${event.home_team}"` : null,
        !awayDbName ? `"${event.away_team}"` : null,
      ].filter(Boolean).join(", ");
      console.warn(`[sync/odds] Unknown team name(s): ${missing} — skipping event`);
      result.errors.push(`Unknown team name(s): ${missing}`);
      result.skipped++;
      continue;
    }

    // Primary: match by Swedish team names + same UTC calendar date.
    // This handles placeholder *times* in the DB (e.g. 16:00 vs 19:00).
    let internalMatch = internalMatches.find(
      (m) =>
        m.home_name === homeDbName &&
        m.away_name === awayDbName &&
        sameCalendarDate(m.scheduled_at, event.commence_time)
    );

    // Fallback: WC matches in North America can cross a UTC date boundary
    // (21:00 EDT = 01:00 UTC next day). If seed dates are off by ±1 day,
    // or seed has placeholder dates entirely, match by team names alone —
    // but only when exactly one such pair exists (prevents group+knockout clash).
    if (!internalMatch) {
      const nameCandidates = internalMatches.filter(
        (m) => m.home_name === homeDbName && m.away_name === awayDbName
      );
      if (nameCandidates.length === 1) {
        internalMatch = nameCandidates[0];
        console.warn(
          `[sync/odds] Date mismatch for "${homeDbName}" vs "${awayDbName}": ` +
          `DB has ${internalMatch.scheduled_at.slice(0, 10)}, ` +
          `API has ${event.commence_time.slice(0, 10)} — using name-only fallback`
        );
      }
    }

    if (!internalMatch) {
      console.warn(
        `[sync/odds] No DB match for "${homeDbName}" vs "${awayDbName}" ` +
        `on ${event.commence_time.slice(0, 10)} (API: "${event.home_team}" vs "${event.away_team}")`
      );
      result.errors.push(
        `No internal match for "${homeDbName}" vs "${awayDbName}" on ${event.commence_time.slice(0, 10)}`
      );
      result.skipped++;
      continue;
    }

    // Skip matches where admin has set odds manually
    if (adminLockedIds.has(internalMatch.id)) {
      result.skipped++;
      continue;
    }

    // Backfill exact kickoff time from API if DB still has a placeholder.
    // Safe to do unconditionally — idempotent if already correct.
    if (internalMatch.scheduled_at !== event.commence_time) {
      const { error: kickoffErr } = await db
        .from("matches")
        .update({ scheduled_at: event.commence_time })
        .eq("id", internalMatch.id);

      if (kickoffErr) {
        console.warn(
          `[sync/odds] Could not update kickoff for match ${internalMatch.id}: ${kickoffErr.message}`
        );
      } else {
        console.log(
          `[sync/odds] Kickoff updated for "${homeDbName}" vs "${awayDbName}": ` +
          `${internalMatch.scheduled_at} → ${event.commence_time}`
        );
        // Keep in-memory copy in sync so subsequent runs in same batch are accurate
        internalMatch.scheduled_at = event.commence_time;
      }
    }

    // Aggregate odds from bookmakers
    const odds = aggregateH2HOdds(event);
    if (!odds) {
      console.warn(`[sync/odds] No complete h2h market for "${homeDbName}" vs "${awayDbName}"`);
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

    console.log(`[sync/odds] Updated odds for "${homeDbName}" vs "${awayDbName}"`);
    result.updated++;
  }

  return result;
}
