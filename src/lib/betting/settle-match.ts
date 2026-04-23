// ─── settle-match.ts ──────────────────────────────────────────────────────────
// Server-side wrapper for the settle_match Postgres RPC.
// Must be called from admin server context only (via createAdminClient).
// The RPC itself is revoked from public — only service_role may call it.

import { createAdminClient } from "@/lib/supabase/admin";

export interface SettleResult {
  ok:                 true;
  matchStatus:        string;
  outcome:            string | null;
  selectionsSettled:  number;
  slipsWon:           number;
  slipsLost:          number;
  slipsVoid:          number;
  totalPayout:        number;
}

export type SettleMatchResult =
  | SettleResult
  | { ok: false; error: string; code: string };

const SETTLE_ERRORS: Record<string, string> = {
  match_not_found:      "Matchen hittades inte",
  match_not_settleable: "Matchen är inte klar — den måste vara avslutad eller ogiltigförklarad",
  scores_missing:       "Matchresultat saknas — sätt resultatet innan settlement körs",
};

export async function settleMatch(matchId: string): Promise<SettleMatchResult> {
  if (!matchId) {
    return { ok: false, code: "invalid_match_id", error: "Ogiltigt match-ID" };
  }

  // Use the admin client (service role) so the RPC EXECUTE grant is satisfied.
  const db = createAdminClient();

  const { data, error } = await db.rpc("settle_match", { p_match_id: matchId });

  if (error) {
    console.error("[settleMatch] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;
    return {
      ok:    false,
      code,
      error: SETTLE_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  return {
    ok:                true,
    matchStatus:       result.match_status as string,
    outcome:           (result.outcome as string | null) ?? null,
    selectionsSettled: result.selections_settled as number,
    slipsWon:          result.slips_won as number,
    slipsLost:         result.slips_lost as number,
    slipsVoid:         result.slips_void as number,
    totalPayout:       result.total_payout as number,
  };
}
