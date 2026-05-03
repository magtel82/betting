import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncResult } from "./types";

// Writes one row to sync_log. Non-fatal — a logging failure must never
// cause the sync itself to fail or throw.
export async function writeSyncLog(
  type: "odds" | "results" | "outrights",
  result: SyncResult,
  durationMs: number
): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.from("sync_log").insert({
      type,
      ran_at:      result.ranAt,
      processed:   result.processed,
      updated:     result.updated,
      skipped:     result.skipped,
      errors:      result.errors,
      duration_ms: durationMs,
    });
    if (error) console.error("[sync/log] Insert failed:", error.message);
  } catch (err) {
    console.error("[sync/log] Unexpected error:", err);
  }
}
