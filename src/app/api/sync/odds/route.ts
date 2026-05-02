// /api/sync/odds
//
// GET  — anropas av Vercel Cron (Authorization: Bearer CRON_SECRET injiceras automatiskt)
// POST — manuell trigger för test och admin-körning
//
// Båda metoderna kör samma sync-logik och kräver samma auth.
//
// Diagnostik — visa tillgängliga sports och kontrollera om VM-sporten finns:
//   GET /api/sync/odds?diagnose=1  -H "Authorization: Bearer <CRON_SECRET>"
//
// Manuell körning:
//   curl -X POST https://bet.telehagen.se/api/sync/odds \
//     -H "Authorization: Bearer <CRON_SECRET>"
//
// CRON_SECRET finns i Vercel Dashboard → Settings → Environment Variables.

import { syncOdds } from "@/lib/sync/odds";
import { writeSyncLog } from "@/lib/sync/log";
import { fetchAvailableSports, SPORT_KEY, OddsApiError } from "@/lib/adapters/odds-api";
import { inspectAdminKey } from "@/lib/supabase/admin";

// Vercel Pro: upp till 300 s. Sätt 60 s för säkerhetsmarginal.
export const maxDuration = 60;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleDiagnose(): Promise<Response> {
  const keyInfo = inspectAdminKey();

  const env = {
    NEXT_PUBLIC_SUPABASE_URL:    !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY:   keyInfo.present,
    ODDS_API_KEY:                !!process.env.ODDS_API_KEY,
    CRON_SECRET:                 !!process.env.CRON_SECRET,
  };

  console.log(
    "[sync/odds diagnose] env:", JSON.stringify(env),
    "| service key role:", keyInfo.role,
    "| prefix:", keyInfo.prefix
  );

  const missing = Object.entries(env)
    .filter(([, present]) => !present)
    .map(([k]) => k);

  if (missing.length > 0) {
    return Response.json(
      { error: "Missing environment variables", missing, env, serviceKeyRole: keyInfo.role },
      { status: 500 }
    );
  }

  if (keyInfo.role !== "service_role") {
    return Response.json(
      {
        error:           "SUPABASE_SERVICE_ROLE_KEY has wrong JWT role",
        serviceKeyRole:  keyInfo.role,
        serviceKeyPrefix: keyInfo.prefix,
        expected:        "service_role",
        fix:             "Paste the correct key from Supabase Dashboard → Project Settings → API → service_role (secret)",
      },
      { status: 500 }
    );
  }

  // Test DB access with admin client
  let dbAccessOk = false;
  let dbError: string | null = null;
  let dbErrorFull: Record<string, unknown> | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient();
    const { error } = await db.from("matches").select("id").limit(1);
    dbAccessOk = !error;
    if (error) {
      dbError = error.message;
      dbErrorFull = { message: error.message, code: error.code, details: error.details, hint: error.hint };
    }
  } catch (err) {
    dbError = String(err);
  }

  if (!dbAccessOk) {
    console.error(`[sync/odds diagnose] DB access failed:`, dbErrorFull ?? dbError);
    return Response.json(
      {
        error:           "Admin DB client cannot read matches",
        detail:          dbError,
        supabaseError:   dbErrorFull,
        serviceKeyRole:  keyInfo.role,
        serviceKeyPrefix: keyInfo.prefix,
        env,
      },
      { status: 500 }
    );
  }

  // Test The Odds API sports list
  try {
    const { sports, debugUrl } = await fetchAvailableSports();
    const soccer  = sports.filter((s) => s.group.toLowerCase().includes("soccer"));
    const wmSport = sports.find((s) => s.key === SPORT_KEY);

    console.log(
      `[sync/odds diagnose] DB OK, ${sports.length} sports, ` +
      `WC sport "${SPORT_KEY}" ${wmSport ? "FOUND" : "NOT FOUND"}`
    );

    return Response.json({
      env,
      dbAccessOk:        true,
      oddsApiKeyPresent: true,
      sportKeyUsed:      SPORT_KEY,
      oddsEndpointUrl:   `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`,
      sportsEndpointUrl: debugUrl,
      wmSportFound:      !!wmSport,
      wmSport:           wmSport ?? null,
      soccerSports:      soccer.map((s) => ({ key: s.key, title: s.title, active: s.active })),
      totalSports:       sports.length,
    });
  } catch (err) {
    const msg = err instanceof OddsApiError ? err.message : String(err);
    console.error(`[sync/odds diagnose] Odds API call failed: ${msg}`);
    return Response.json({ env, dbAccessOk: true, error: msg }, { status: 500 });
  }
}

async function handleSync(request: Request): Promise<Response> {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("diagnose") === "1") {
    return handleDiagnose();
  }

  const keyInfo = inspectAdminKey();
  console.log(
    "[sync/odds] Starting odds sync |",
    "SERVICE_KEY present:", keyInfo.present,
    "| role:", keyInfo.role,
    "| prefix:", keyInfo.prefix
  );

  const startedAt = Date.now();
  try {
    const result = await syncOdds();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[sync/odds] Done — updated=${result.updated} skipped=${result.skipped} ` +
      `errors=${result.errors.length} processed=${result.processed} duration=${durationMs}ms`
    );
    if (result.errors.length > 0) {
      console.error("[sync/odds] Errors:\n" + result.errors.join("\n"));
    }
    await writeSyncLog("odds", result, durationMs);
    const httpStatus =
      result.updated > 0 || result.errors.length === 0 ? 200 : 500;
    return Response.json(result, { status: httpStatus });
  } catch (err) {
    console.error("[sync/odds] Unexpected error:", err);
    return Response.json(
      { error: "Internal error", detail: String(err) },
      { status: 500 }
    );
  }
}

// GET: Vercel Cron
export const GET = handleSync;

// POST: manuell curl / admin-test
export const POST = handleSync;
