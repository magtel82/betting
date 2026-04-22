// ─── Results sync ─────────────────────────────────────────────────────────────
// Fetches match schedules and results from football-data.org and updates
// matches in our DB.
//
// Idempotency: updates only changed fields; a second run with the same data
// produces no DB writes (Supabase update on unchanged rows is still safe).
//
// Admin fallback protection:
//   - Matches with status='void' are NEVER overwritten by the API. Void is an
//     explicit admin decision (cancelled match, data error etc.).
//   - For all other statuses, API data takes precedence.
//
// Matching strategy (two-pass):
//   Pass 1 — by external_id (fast path after first successful sync)
//   Pass 2 — by (home short_name + away short_name + date window)
//             then stores the external_id for future runs

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchMatchesForTournament,
  FD_STATUS_MAP,
  FootballDataError,
  type FDMatch,
} from "@/lib/adapters/football-data";
import { resolveTeamShortName, datesWithinTolerance } from "./team-map";
import { emptySyncResult, type SyncResult } from "./types";

interface InternalMatch {
  id:           string;
  external_id:  string | null;
  scheduled_at: string;
  status:       string;
  home_score:   number | null;
  away_score:   number | null;
  home_score_ht:number | null;
  away_score_ht:number | null;
  home_short:   string | null;
  away_short:   string | null;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncResults(): Promise<SyncResult> {
  const result = emptySyncResult("football-data.org");
  const db = createAdminClient();

  // 1. Fetch all non-void internal matches with team short_names
  const { data: matches, error: matchErr } = await db
    .from("matches")
    .select("id, external_id, scheduled_at, status, home_score, away_score, home_score_ht, away_score_ht, home_team:teams!matches_home_team_id_fkey(short_name), away_team:teams!matches_away_team_id_fkey(short_name)")
    .neq("status", "void");

  if (matchErr || !matches) {
    result.errors.push(`DB read failed: ${matchErr?.message ?? "no data"}`);
    return result;
  }

  const internalMatches: InternalMatch[] = (matches as unknown as Array<{
    id:             string;
    external_id:    string | null;
    scheduled_at:   string;
    status:         string;
    home_score:     number | null;
    away_score:     number | null;
    home_score_ht:  number | null;
    away_score_ht:  number | null;
    home_team:      { short_name: string } | null;
    away_team:      { short_name: string } | null;
  }>).map((m) => ({
    id:            m.id,
    external_id:   m.external_id,
    scheduled_at:  m.scheduled_at,
    status:        m.status,
    home_score:    m.home_score,
    away_score:    m.away_score,
    home_score_ht: m.home_score_ht,
    away_score_ht: m.away_score_ht,
    home_short:    m.home_team?.short_name ?? null,
    away_short:    m.away_team?.short_name ?? null,
  }));

  // Build lookup by external_id for fast path
  const byExternalId = new Map<string, InternalMatch>();
  for (const m of internalMatches) {
    if (m.external_id) byExternalId.set(m.external_id, m);
  }

  // 2. Fetch from football-data.org
  let fdMatches: FDMatch[];
  try {
    fdMatches = await fetchMatchesForTournament();
  } catch (err) {
    const msg = err instanceof FootballDataError ? err.message : String(err);
    result.errors.push(`API fetch failed: ${msg}`);
    return result;
  }

  result.processed = fdMatches.length;

  // 3. Process each external match
  for (const fd of fdMatches) {
    const externalIdStr = String(fd.id);

    // ── Pass 1: match by external_id ───────────────────────────────────────
    let internal = byExternalId.get(externalIdStr) ?? null;

    // ── Pass 2: match by team names + date window ──────────────────────────
    if (!internal) {
      const homeShort = resolveTeamShortName(fd.homeTeam.name) ??
                        resolveTeamShortName(fd.homeTeam.tla);
      const awayShort = resolveTeamShortName(fd.awayTeam.name) ??
                        resolveTeamShortName(fd.awayTeam.tla);

      if (homeShort && awayShort) {
        internal = internalMatches.find(
          (m) =>
            m.home_short === homeShort &&
            m.away_short === awayShort &&
            datesWithinTolerance(m.scheduled_at, fd.utcDate)
        ) ?? null;
      }

      // If found via name+date, store external_id for future fast-path lookups
      if (internal) {
        await db
          .from("matches")
          .update({ external_id: externalIdStr })
          .eq("id", internal.id)
          .is("external_id", null); // Only set if not already set
        byExternalId.set(externalIdStr, { ...internal, external_id: externalIdStr });
      }
    }

    if (!internal) {
      result.errors.push(
        `No internal match for external id ${fd.id} (${fd.homeTeam.name} vs ${fd.awayTeam.name} at ${fd.utcDate})`
      );
      result.skipped++;
      continue;
    }

    // Map status
    const newStatus = FD_STATUS_MAP[fd.status] ?? "scheduled";
    const newHomeScore     = fd.score.fullTime.home;
    const newAwayScore     = fd.score.fullTime.away;
    const newHomeScoreHt   = fd.score.halfTime.home;
    const newAwayScoreHt   = fd.score.halfTime.away;

    // Check if anything actually changed to avoid unnecessary writes
    const statusChanged  = internal.status    !== newStatus;
    const scoreChanged   =
      internal.home_score    !== newHomeScore  ||
      internal.away_score    !== newAwayScore  ||
      internal.home_score_ht !== newHomeScoreHt ||
      internal.away_score_ht !== newAwayScoreHt;

    if (!statusChanged && !scoreChanged) {
      result.skipped++;
      continue;
    }

    const { error: updateErr } = await db
      .from("matches")
      .update({
        status:        newStatus,
        home_score:    newHomeScore,
        away_score:    newAwayScore,
        home_score_ht: newHomeScoreHt,
        away_score_ht: newAwayScoreHt,
      })
      .eq("id", internal.id);

    if (updateErr) {
      result.errors.push(
        `DB update failed for match ${internal.id}: ${updateErr.message}`
      );
      result.skipped++;
      continue;
    }

    result.updated++;
  }

  return result;
}
