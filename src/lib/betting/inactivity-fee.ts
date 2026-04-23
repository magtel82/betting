import { createAdminClient } from "@/lib/supabase/admin";

export interface InactivityFeeResult {
  ok:        true;
  feeDate:   string;
  charged:   number;
  active:    number;
  skipZero:  number;
  skipIdem:  number;
  skipped?:  string; // 'not_a_matchday' if no match that day
}

export type ApplyInactivityFeeResult =
  | InactivityFeeResult
  | { ok: false; error: string; code: string };

export async function applyInactivityFee(
  leagueId: string,
  feeDate:  string,   // ISO date string YYYY-MM-DD (Swedish calendar date)
): Promise<ApplyInactivityFeeResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("apply_inactivity_fee", {
    p_league_id: leagueId,
    p_fee_date:  feeDate,
  });

  if (error) {
    console.error("[applyInactivityFee] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;

  return {
    ok:       true,
    feeDate:  result.fee_date as string ?? feeDate,
    charged:  result.charged  as number ?? 0,
    active:   result.active   as number ?? 0,
    skipZero: result.skip_zero as number ?? 0,
    skipIdem: result.skip_idem as number ?? 0,
    skipped:  result.skipped  as string | undefined,
  };
}
