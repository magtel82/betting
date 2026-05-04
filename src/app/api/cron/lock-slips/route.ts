// /api/cron/lock-slips
//
// GET — anropas av Vercel Cron var 30:e minut.
//       Låser öppna slip där minst en match har startat (scheduled_at <= now()).
//       Idempotent — safe att köra upprepade gånger.
//
// POST — manuell test-trigger.
//
// Manuell körning:
//   curl -X POST https://bet.telehagen.se/api/cron/lock-slips \
//     -H "Authorization: Bearer <CRON_SECRET>"

import { lockStartedSlips } from "@/lib/betting/lock-slips";

export const maxDuration = 30;

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleLock(request: Request): Promise<Response> {
  if (!isAuthorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await lockStartedSlips();

  if (!result.ok) {
    console.error("[cron/lock-slips] RPC error:", result.error);
    return Response.json({ error: result.error }, { status: 500 });
  }

  console.log(`[cron/lock-slips] Locked ${result.locked} slips`);
  return Response.json({ locked: result.locked });
}

export const GET  = handleLock;
export const POST = handleLock;
