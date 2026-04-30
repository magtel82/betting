// ─── place-slip.ts ────────────────────────────────────────────────────────────
// Server-side logic for placing a matchslip.
//
// The atomic work (validation, wallet deduction, DB inserts) happens inside
// the place_bet_slip Postgres RPC function, which runs as SECURITY DEFINER
// in a single transaction. This file handles the TypeScript layer:
// structural validation, session resolution, and error mapping.
//
// MUST be called from server context only (Server Action or Route Handler).
// Uses the user's authenticated Supabase client so auth.uid() is populated
// inside the RPC.

import { createClient } from "@/lib/supabase/server";
import type { BetOutcome } from "@/types";

// ─── Input / output types ─────────────────────────────────────────────────────

export interface SelectionInput {
  matchId:      string;
  outcome:      BetOutcome;
  oddsSnapshot: number;
}

export type PlaceSlipResult =
  | {
      ok:             true;
      slipId:         string;
      combinedOdds:   number;
      potentialPayout: number;
    }
  | {
      ok:           false;
      error:        string;
      code:         string;
      matchId?:     string;
      currentOdds?: number;
      maxStake?:    number;
    };

// ─── Error code → Swedish message ─────────────────────────────────────────────

const RPC_ERRORS: Record<string, string> = {
  unauthorized:            "Ingen behörighet att lägga slip",
  member_not_found:        "Ditt ligamedlemskap hittades inte",
  league_closed:           "Ligan är stängd för betting",
  invalid_selection_count: "Slipet måste ha 1–5 matcher",
  stake_too_low:           "Minsta insats är 10 coins",
  stake_exceeds_limit:     "Insatsen överstiger maxgränsen (30% av saldo)",
  insufficient_balance:    "Otillräckligt saldo",
  invalid_outcome:         "Ogiltigt utfall (måste vara hemma, oavgjort eller borta)",
  match_not_found:         "Matchen hittades inte",
  match_not_bettable:      "Matchen är inte spelbar — den har redan startat eller avslutats",
  no_odds:                 "Odds saknas för en av matcherna",
  odds_changed:            "Oddsen har ändrats sedan sidan laddades — bekräfta de nya oddsen och försök igen",
};

// ─── Main function ────────────────────────────────────────────────────────────

export async function placeSlip(
  selections: SelectionInput[],
  stake:      number,
): Promise<PlaceSlipResult> {

  // ── Structural validation (before any DB round-trip) ──────────────────────

  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 5) {
    return { ok: false, code: "invalid_selection_count", error: "Slipet måste ha 1–5 matcher" };
  }

  if (!Number.isInteger(stake) || stake < 10) {
    return { ok: false, code: "stake_too_low", error: "Minsta insats är 10 coins" };
  }

  // Duplicate match check — enforced by DB unique constraint too, but catch
  // it here for a cleaner error message
  const matchIds = selections.map((s) => s.matchId);
  if (new Set(matchIds).size !== matchIds.length) {
    return { ok: false, code: "duplicate_match", error: "Max en selection per match i ett slip" };
  }

  for (const sel of selections) {
    if (!["home", "draw", "away"].includes(sel.outcome)) {
      return { ok: false, code: "invalid_outcome", error: "Ogiltigt utfall" };
    }
    // Coerce to number — Supabase numeric columns can occasionally arrive as
    // strings depending on the PostgREST version; Number() handles both safely.
    const oddsNum = Number(sel.oddsSnapshot);
    if (!Number.isFinite(oddsNum) || oddsNum <= 1) {
      return { ok: false, code: "invalid_odds", error: "Ogiltiga odds i selection" };
    }
  }

  // ── Resolve league_member_id from session ─────────────────────────────────
  // The user client is used throughout — auth.uid() inside the RPC reflects
  // the authenticated user, which lets the RPC verify ownership.

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "not_authenticated", error: "Inte inloggad" };
  }

  const { data: member } = await supabase
    .from("league_members")
    .select("id, match_wallet")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return { ok: false, code: "member_not_found", error: RPC_ERRORS.member_not_found };
  }

  // Quick client-side stake check to give instant feedback before the RPC
  // (the RPC rechecks this atomically — this is only for UX)
  const maxStake = Math.floor(member.match_wallet * 0.3);
  if (stake > maxStake) {
    return {
      ok:       false,
      code:     "stake_exceeds_limit",
      error:    `Max insats är ${maxStake} coins (30% av ${member.match_wallet})`,
      maxStake,
    };
  }

  // ── Call atomic RPC ───────────────────────────────────────────────────────

  const rpcPayload = {
    p_league_member_id: member.id,
    p_stake:            stake,
    p_selections:       selections.map((s) => ({
      match_id:      s.matchId,
      outcome:       s.outcome,
      odds_snapshot: s.oddsSnapshot,
    })),
  };

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "place_bet_slip",
    rpcPayload,
  );

  if (rpcError) {
    console.error("[placeSlip] RPC error:", rpcError.message, rpcError.code, rpcError.details);
    const code = rpcError.code ?? "unknown";
    return { ok: false, code: "rpc_error", error: `Internt fel (${code}) — försök igen` };
  }

  const result = rpcData as Record<string, unknown>;

  // ── Map RPC errors to user-friendly responses ─────────────────────────────

  if (result.error) {
    const code = result.error as string;

    if (code === "odds_changed") {
      return {
        ok:          false,
        code,
        error:       RPC_ERRORS.odds_changed,
        matchId:     result.match_id as string | undefined,
        currentOdds: result.current != null ? Number(result.current) : undefined,
      };
    }

    if (code === "stake_exceeds_limit") {
      return {
        ok:       false,
        code,
        error:    RPC_ERRORS.stake_exceeds_limit,
        maxStake: result.max_stake as number | undefined,
      };
    }

    return {
      ok:    false,
      code,
      error: RPC_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  // ── Success ───────────────────────────────────────────────────────────────

  return {
    ok:             true,
    slipId:         result.slip_id as string,
    combinedOdds:   Number(result.combined_odds),
    potentialPayout: result.potential_payout as number,
  };
}
