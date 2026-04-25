// ─── settle-special-market.ts ─────────────────────────────────────────────────
// Wrapper for the settle_special_market Postgres RPC.
// Must be called from admin server context only — uses createAdminClient so
// the service_role EXECUTE grant on the RPC is satisfied.

import { createAdminClient } from "@/lib/supabase/admin";

export interface SettleSpecialMarketResult {
  ok:        true;
  betsWon:   number;
  betsLost:  number;
  totalPaid: number;
}

export type SettleSpecialMarketResponse =
  | SettleSpecialMarketResult
  | { ok: false; code: string; error: string };

const RPC_ERRORS: Record<string, string> = {
  market_not_found:  "Marknaden hittades inte",
  already_settled:   "Marknaden är redan avgjord — settlement kan inte köras igen",
  result_text_empty: "Utfallet får inte vara tomt",
};

export async function settleSpecialMarket(
  marketId:   string,
  resultText: string,
): Promise<SettleSpecialMarketResponse> {
  if (!marketId) {
    return { ok: false, code: "invalid_market_id", error: "Ogiltigt marknad-ID" };
  }
  if (!resultText.trim()) {
    return { ok: false, code: "result_text_empty", error: RPC_ERRORS.result_text_empty };
  }

  const db = createAdminClient();

  const { data, error } = await db.rpc("settle_special_market", {
    p_market_id:   marketId,
    p_result_text: resultText.trim(),
  });

  if (error) {
    console.error("[settleSpecialMarket] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;
    return {
      ok:    false,
      code,
      error: RPC_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  return {
    ok:        true,
    betsWon:   result.bets_won as number,
    betsLost:  result.bets_lost as number,
    totalPaid: result.total_paid as number,
  };
}
