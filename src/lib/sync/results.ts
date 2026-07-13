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
  FD_DURATION_MAP,
  FootballDataError,
  type FDMatch,
} from "@/lib/adapters/football-data";
import type { DecidedBy } from "@/types";
import { resolveTeamShortName, datesWithinTolerance } from "./team-map";
import { emptySyncResult, type SyncResult } from "./types";

interface InternalMatch {
  id:            string;
  external_id:   string | null;
  scheduled_at:  string;
  status:        string;
  home_score:    number | null;
  away_score:    number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  reg_home_score:number | null;
  reg_away_score:number | null;
  decided_by:    DecidedBy | null;
  home_short:    string | null;
  away_short:    string | null;
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncResults(): Promise<SyncResult> {
  const result = emptySyncResult("football-data.org");
  const db = createAdminClient();

  // 1. Fetch all non-void internal matches with team short_names
  const { data: matches, error: matchErr } = await db
    .from("matches")
    .select("id, external_id, scheduled_at, status, home_score, away_score, home_score_ht, away_score_ht, reg_home_score, reg_away_score, decided_by, home_team:teams!matches_home_team_id_fkey(short_name), away_team:teams!matches_away_team_id_fkey(short_name)")
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
    reg_home_score: number | null;
    reg_away_score: number | null;
    decided_by:     DecidedBy | null;
    home_team:      { short_name: string } | null;
    away_team:      { short_name: string } | null;
  }>).map((m) => ({
    id:             m.id,
    external_id:    m.external_id,
    scheduled_at:   m.scheduled_at,
    status:         m.status,
    home_score:     m.home_score,
    away_score:     m.away_score,
    home_score_ht:  m.home_score_ht,
    away_score_ht:  m.away_score_ht,
    reg_home_score: m.reg_home_score,
    reg_away_score: m.reg_away_score,
    decided_by:     m.decided_by,
    home_short:     m.home_team?.short_name ?? null,
    away_short:     m.away_team?.short_name ?? null,
  }));

  // Build lookup by external_id for fast path
  const byExternalId = new Map<string, InternalMatch>();
  for (const m of internalMatches) {
    if (m.external_id) byExternalId.set(m.external_id, m);
  }

  // Valid short_names in the DB — used as a robust fallback when football-data's
  // team name spelling differs from the map. Their `tla` field is the FIFA code,
  // which equals our short_name, so any team resolves even with unmapped names.
  const validShortNames = new Set<string>();
  for (const m of internalMatches) {
    if (m.home_short) validShortNames.add(m.home_short);
    if (m.away_short) validShortNames.add(m.away_short);
  }
  const resolveShort = (name: string | null, tla: string | null): string | null =>
    resolveTeamShortName(name) ??
    resolveTeamShortName(tla) ??
    (tla && validShortNames.has(tla.toUpperCase()) ? tla.toUpperCase() : null);

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
      const homeShort = resolveShort(fd.homeTeam.name, fd.homeTeam.tla);
      const awayShort = resolveShort(fd.awayTeam.name, fd.awayTeam.tla);

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
      // TBD knockout fixtures (teams not yet determined) come back with null
      // names from football-data. Skip them silently — they are expected to be
      // unmatchable until the bracket fills in, and logging 32 of them daily
      // would falsely flag the sync as failing.
      const isTbd = !fd.homeTeam.name && !fd.awayTeam.name;
      if (!isTbd) {
        result.errors.push(
          `No internal match for external id ${fd.id} (${fd.homeTeam.name} vs ${fd.awayTeam.name} at ${fd.utcDate})`
        );
      }
      result.skipped++;
      continue;
    }

    // Map status
    const newStatus = FD_STATUS_MAP[fd.status] ?? "scheduled";

    const decidedBy = FD_DURATION_MAP[fd.score.duration];
    const isRegular = decidedBy === "regular";

    const fullHome = fd.score.fullTime.home;
    const fullAway = fd.score.fullTime.away;
    const regHome  = fd.score.regularTime?.home ?? null;
    const regAway  = fd.score.regularTime?.away ?? null;

    // A match decided past 90 min must expose its 90-minute score, otherwise we
    // cannot settle on the (drawn) 90-minute outcome. Skip rather than write a
    // NULL reg score and let settle_match fall back to the full-time result,
    // which would settle knockout draws as a win for the eventual winner.
    if (!isRegular && (regHome === null || regAway === null)) {
      result.errors.push(
        `Match ${internal.id} (ext ${externalIdStr}): duration=${fd.score.duration} but score.regularTime missing — skipping to avoid settling on full-time score`
      );
      result.skipped++;
      continue;
    }

    // Displayed result is the score at the end of open play. For a shootout,
    // fullTime is the aggregate tally (e.g. 7–6), so fall back to the 90-minute
    // score, which is the meaningful scoreline to show.
    const newHomeScore   = decidedBy === "penalties" ? regHome ?? fullHome : fullHome;
    const newAwayScore   = decidedBy === "penalties" ? regAway ?? fullAway : fullAway;
    const newHomeScoreHt = fd.score.halfTime.home;
    const newAwayScoreHt = fd.score.halfTime.away;

    // 90-minute score for settlement — stored only when decided past 90 min
    // (always a draw, since a match only goes to ET/pens when level after 90).
    const newRegHome   = isRegular ? null : regHome;
    const newRegAway   = isRegular ? null : regAway;
    const newDecidedBy = isRegular ? null : decidedBy;

    // Check if anything actually changed to avoid unnecessary writes
    const statusChanged  = internal.status    !== newStatus;
    const scoreChanged   =
      internal.home_score     !== newHomeScore   ||
      internal.away_score     !== newAwayScore   ||
      internal.home_score_ht  !== newHomeScoreHt ||
      internal.away_score_ht  !== newAwayScoreHt ||
      internal.reg_home_score !== newRegHome     ||
      internal.reg_away_score !== newRegAway     ||
      internal.decided_by     !== newDecidedBy;

    if (!statusChanged && !scoreChanged) {
      result.skipped++;
      continue;
    }

    const { error: updateErr } = await db
      .from("matches")
      .update({
        status:         newStatus,
        home_score:     newHomeScore,
        away_score:     newAwayScore,
        home_score_ht:  newHomeScoreHt,
        away_score_ht:  newAwayScoreHt,
        reg_home_score: newRegHome,
        reg_away_score: newRegAway,
        decided_by:     newDecidedBy,
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
