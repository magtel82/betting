// /api/sync/results
//
// GET  — anropas av Vercel Cron (Authorization: Bearer CRON_SECRET injiceras automatiskt)
// POST — manuell trigger för test och admin-körning
//
// Båda metoderna kör samma sync-logik och kräver samma auth.
//
// Manuell körning:
//   curl -X POST https://bet.telehagen.se/api/sync/results \
//     -H "Authorization: Bearer <CRON_SECRET>"
//
// CRON_SECRET finns i Vercel Dashboard → Settings → Environment Variables.

import { syncResults } from "@/lib/sync/results";
import { writeSyncLog } from "@/lib/sync/log";
import { applyInactivityFee } from "@/lib/betting/inactivity-fee";
import { lockStartedSlips } from "@/lib/betting/lock-slips";
import { settleMatch } from "@/lib/betting/settle-match";
import { createAdminClient } from "@/lib/supabase/admin";

const LEAGUE_ID = "b1000000-0000-0000-0000-000000000001";

// Vercel Pro: upp till 300 s. Sätt 60 s för säkerhetsmarginal.
export const maxDuration = 60;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleSync(request: Request): Promise<Response> {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await syncResults();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[sync/results] Done — updated=${result.updated} skipped=${result.skipped} ` +
      `errors=${result.errors.length} processed=${result.processed} duration=${durationMs}ms`
    );
    if (result.errors.length > 0) {
      console.error("[sync/results] Errors:\n" + result.errors.join("\n"));
    }
    await writeSyncLog("results", result, durationMs);

    // Lock slips for matches that have already started.
    const lockResult = await lockStartedSlips();
    console.log("[sync/results] Lock slips:", JSON.stringify(lockResult));

    // Settle any finished matches that still have locked slips.
    const settleStats = await autoSettleFinishedMatches();
    console.log("[sync/results] Auto-settle:", JSON.stringify(settleStats));

    // Apply inactivity fee for yesterday (Stockholm time).
    // Cron runs at 06:00 UTC = 08:00 Stockholm — all previous day's matches are done.
    const yesterdayStockholm = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    const feeResult = await applyInactivityFee(LEAGUE_ID, yesterdayStockholm);
    console.log("[sync/results] Inactivity fee:", JSON.stringify(feeResult));

    const httpStatus =
      result.updated > 0 || result.errors.length === 0 ? 200 : 500;
    return Response.json(result, { status: httpStatus });
  } catch (err) {
    console.error("[sync/results] Unexpected error:", err);
    return Response.json(
      { error: "Internal error", detail: String(err) },
      { status: 500 }
    );
  }
}

// ─── Auto-settlement helper ───────────────────────────────────────────────────
// Finds all finished matches with at least one locked slip and settles them.
// The settle_match RPC is idempotent — calling it on an already-settled match
// returns 0 rows changed, so this is safe to run on every cron tick.

interface AutoSettleStats {
  attempted: number;
  settled:   number;
  errors:    string[];
}

async function autoSettleFinishedMatches(): Promise<AutoSettleStats> {
  const stats: AutoSettleStats = { attempted: 0, settled: 0, errors: [] };
  const db = createAdminClient();

  // Step 1: collect all locked slip IDs.
  const { data: lockedSlips, error: slipErr } = await db
    .from("bet_slips")
    .select("id")
    .eq("status", "locked");

  if (slipErr) {
    stats.errors.push(`Query failed: ${slipErr.message}`);
    return stats;
  }

  const lockedSlipIds = (lockedSlips ?? []).map((s) => s.id);
  if (lockedSlipIds.length === 0) return stats;

  // Step 2: collect the distinct match IDs covered by those slips.
  const { data: selections, error: selErr } = await db
    .from("bet_slip_selections")
    .select("match_id")
    .in("slip_id", lockedSlipIds);

  if (selErr) {
    stats.errors.push(`Selection query failed: ${selErr.message}`);
    return stats;
  }

  const pendingMatchIds = [...new Set((selections ?? []).map((s) => s.match_id))];
  if (pendingMatchIds.length === 0) return stats;

  // Step 3: of those, find the ones that are finished.
  const { data: finishedMatches, error: matchErr } = await db
    .from("matches")
    .select("id")
    .eq("status", "finished")
    .in("id", pendingMatchIds);

  if (matchErr) {
    stats.errors.push(`Match query failed: ${matchErr.message}`);
    return stats;
  }

  for (const { id } of finishedMatches ?? []) {
    stats.attempted++;
    const res = await settleMatch(id);
    if (res.ok) {
      if (res.selectionsSettled > 0) {
        stats.settled++;
        console.log(
          `[sync/results] Settled match ${id}: ` +
          `won=${res.slipsWon} lost=${res.slipsLost} void=${res.slipsVoid} payout=${res.totalPayout}`
        );
      }
    } else {
      stats.errors.push(`settle ${id}: ${res.error}`);
    }
  }

  return stats;
}

// GET: Vercel Cron
export const GET = handleSync;

// POST: manuell curl / admin-test
export const POST = handleSync;
