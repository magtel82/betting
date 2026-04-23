// ─── cancel-slip.ts ───────────────────────────────────────────────────────────
// Server-side logic for cancelling a matchslip.
// The atomic work happens in the cancel_bet_slip Postgres RPC (SECURITY DEFINER).
// MUST be called from server context only.

import { createClient } from "@/lib/supabase/server";

export type CancelSlipResult =
  | { ok: true;  refunded: number }
  | { ok: false; error: string; code: string };

const CANCEL_ERRORS: Record<string, string> = {
  unauthorized:         "Ingen behörighet att ta bort detta slip",
  member_not_found:     "Ditt ligamedlemskap hittades inte",
  slip_not_found:       "Slipet hittades inte",
  slip_not_open:        "Slipet är redan låst eller avgjort och kan inte tas bort",
  match_already_started:"En eller flera matcher i slipet har redan startat",
};

export async function cancelSlip(slipId: string): Promise<CancelSlipResult> {
  if (!slipId) {
    return { ok: false, code: "invalid_slip_id", error: "Ogiltigt slip-ID" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("cancel_bet_slip", {
    p_slip_id: slipId,
  });

  if (error) {
    console.error("[cancelSlip] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;
    return {
      ok:    false,
      code,
      error: CANCEL_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  return { ok: true, refunded: result.refunded as number };
}
