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

  try {
    const result = await syncResults();
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

// GET: Vercel Cron
export const GET = handleSync;

// POST: manuell curl / admin-test
export const POST = handleSync;
