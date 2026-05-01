"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { placeSlip } from "@/lib/betting/place-slip";
import type { SelectionInput, PlaceSlipResult } from "@/lib/betting/place-slip";

// ─── placeSlipAction ─────────────────────────────────────────────────────────
// Server Action wrapper for placing a new matchslip.

export async function placeSlipAction(
  selections: SelectionInput[],
  stake:      number,
): Promise<PlaceSlipResult> {
  const result = await placeSlip(selections, stake);

  if (result.ok) {
    revalidatePath("/bet");
    revalidatePath("/mina-bet");
  }

  return result;
}

// ─── amendSlipAction ─────────────────────────────────────────────────────────
// Atomically cancels an old open slip and places a new one via the
// amend_bet_slip RPC — single DB transaction so odds_changed errors
// leave the old slip intact (the caller can retry with updated odds).

const AMEND_ERRORS: Record<string, string> = {
  unauthorized:           "Ingen behörighet att ändra detta slip",
  member_not_found:       "Ditt ligamedlemskap hittades inte",
  slip_not_found:         "Det ursprungliga slipet hittades inte",
  slip_not_open:          "Slipet är redan låst eller avgjort",
  match_already_started:  "En match i det gamla slipet har startat — det kan inte längre ändras",
  league_closed:          "Ligan är stängd för betting",
  invalid_selection_count:"Slipet måste ha 1–5 matcher",
  stake_too_low:          "Minsta insats är 10 coins",
  stake_exceeds_limit:    "Insatsen överstiger maxgränsen (30% av saldo)",
  insufficient_balance:   "Otillräckligt saldo",
  invalid_outcome:        "Ogiltigt utfall",
  match_not_found:        "Matchen hittades inte",
  match_not_bettable:     "Matchen är inte spelbar — den har redan startat eller avslutats",
  no_odds:                "Odds saknas för en av matcherna",
  odds_changed:           "Oddsen har ändrats sedan sidan laddades — bekräfta de nya oddsen och försök igen",
};

export async function amendSlipAction(
  oldSlipId:  string,
  selections: SelectionInput[],
  stake:      number,
): Promise<PlaceSlipResult> {
  if (!oldSlipId) {
    return { ok: false, code: "invalid_slip_id", error: "Ogiltigt slip-ID" };
  }

  // Mirror the same structural validation used in placeSlip() — catch bad
  // input before any DB round-trip, and give a clean error on duplicates
  // (the DB unique constraint would also catch it, but with a less clear code).
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 5) {
    return { ok: false, code: "invalid_selection_count", error: "Slipet måste ha 1–5 matcher" };
  }

  if (!Number.isInteger(stake) || stake < 10) {
    return { ok: false, code: "stake_too_low", error: "Minsta insats är 10 coins" };
  }

  const matchIds = selections.map((s) => s.matchId);
  if (new Set(matchIds).size !== matchIds.length) {
    return { ok: false, code: "duplicate_match", error: "Max en selection per match i ett slip" };
  }

  for (const sel of selections) {
    if (!["home", "draw", "away"].includes(sel.outcome)) {
      return { ok: false, code: "invalid_outcome", error: "Ogiltigt utfall" };
    }
    const oddsNum = Number(sel.oddsSnapshot);
    if (!Number.isFinite(oddsNum) || oddsNum <= 1) {
      return { ok: false, code: "invalid_odds", error: "Ogiltiga odds i selection" };
    }
  }

  const supabase = await createClient();

  // Resolve league_member_id needed for the quick client-side stake check.
  // The RPC performs the authoritative check atomically.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "not_authenticated", error: "Inte inloggad" };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("amend_bet_slip", {
    p_old_slip_id: oldSlipId,
    p_stake:       stake,
    p_selections:  selections.map((s) => ({
      match_id:      s.matchId,
      outcome:       s.outcome,
      odds_snapshot: s.oddsSnapshot,
    })),
  });

  if (rpcError) {
    console.error("[amendSlipAction] RPC error:", rpcError.message, rpcError.code, rpcError.details);
    const code = rpcError.code ?? "unknown";
    return { ok: false, code: "rpc_error", error: `Internt fel (${code}) — försök igen` };
  }

  const result = rpcData as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;

    if (code === "odds_changed") {
      return {
        ok:          false,
        code,
        error:       AMEND_ERRORS.odds_changed,
        matchId:     result.match_id as string | undefined,
        currentOdds: result.current != null ? Number(result.current) : undefined,
      };
    }

    if (code === "stake_exceeds_limit") {
      return {
        ok:       false,
        code,
        error:    AMEND_ERRORS.stake_exceeds_limit,
        maxStake: result.max_stake as number | undefined,
      };
    }

    return {
      ok:    false,
      code,
      error: AMEND_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  revalidatePath("/bet");
  revalidatePath("/mina-bet");

  return {
    ok:              true,
    slipId:          result.slip_id as string,
    combinedOdds:    Number(result.combined_odds),
    potentialPayout: result.potential_payout as number,
  };
}
