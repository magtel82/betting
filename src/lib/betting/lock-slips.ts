import { createAdminClient } from "@/lib/supabase/admin";

export type LockSlipsResult =
  | { ok: true; locked: number }
  | { ok: false; error: string; code: string };

export async function lockStartedSlips(): Promise<LockSlipsResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("lock_started_slips");

  if (error) {
    console.error("[lockStartedSlips] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;
  return { ok: true, locked: result.locked as number };
}
