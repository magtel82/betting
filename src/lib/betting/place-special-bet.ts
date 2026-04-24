// ─── place-special-bet.ts ─────────────────────────────────────────────────────
// Server-side logic for placing, amending, and cancelling special bets.
//
// The atomic work (versioning, wallet deduction, ledger) happens inside
// place_special_bet / cancel_special_bet Postgres RPCs (SECURITY DEFINER).
// This file handles the TypeScript layer: member resolution, error mapping.
//
// MUST be called from server context only (Server Action or Route Handler).
// Uses the user's authenticated Supabase client so auth.uid() is populated.

import { createClient } from "@/lib/supabase/server";

// ─── Input / output types ─────────────────────────────────────────────────────

export interface PlaceSpecialBetInput {
  marketId:      string;
  selectionText: string;
  stake:         number;
  // Odds shown to the player when the form was loaded.
  // For vm_vinnare/skyttekung: used to detect stale odds server-side.
  // For sverige_mal: pass the fixed factor (4.0) — no change detection.
  oddsSnapshot:  number;
}

export type PlaceSpecialBetResult =
  | {
      ok:              true;
      specialBetId:    string;
      version:         number;
      oddsSnapshot:    number;
      potentialPayout: number;
    }
  | {
      ok:           false;
      code:         string;
      error:        string;
      currentOdds?: number; // present when code = 'odds_changed'
      balance?:     number; // present when code = 'insufficient_balance'
    };

export type CancelSpecialBetResult =
  | { ok: true }
  | { ok: false; code: string; error: string };

// ─── Error code → Swedish message ─────────────────────────────────────────────

const RPC_ERRORS: Record<string, string> = {
  unauthorized:         "Ingen behörighet",
  member_not_found:     "Ditt ligamedlemskap hittades inte",
  league_closed:        "Ligan är stängd",
  deadline_passed:      "Deadline har passerat — inga fler ändringar tillåts",
  stake_too_low:        "Minsta insats är 100 coins",
  insufficient_balance: "Otillräckligt saldo i special_wallet",
  market_not_found:     "Marknaden hittades inte",
  no_odds:              "Odds är ännu inte satta för den här marknaden",
  odds_changed:         "Oddsen har ändrats sedan sidan laddades — bekräfta de nya oddsen och försök igen",
  not_found:            "Bettet hittades inte",
  bet_not_active:       "Bettet är inte aktivt och kan inte avbokas",
};

function mapError(code: string, extra?: { currentOdds?: number; balance?: number }): PlaceSpecialBetResult & { ok: false } {
  return {
    ok:           false,
    code,
    error:        RPC_ERRORS[code] ?? "Något gick fel — försök igen",
    currentOdds:  extra?.currentOdds,
    balance:      extra?.balance,
  };
}

// ─── placeSpecialBet ─────────────────────────────────────────────────────────
// Places a new special bet or amends an existing active bet for the same market.
// On amendment: old version → 'superseded', new version → 'active'.

export async function placeSpecialBet(
  input: PlaceSpecialBetInput,
): Promise<PlaceSpecialBetResult> {
  const { marketId, selectionText, stake, oddsSnapshot } = input;

  // ── Quick structural validation ───────────────────────────────────────────
  if (!Number.isInteger(stake) || stake < 100) {
    return mapError("stake_too_low");
  }
  if (!selectionText.trim()) {
    return { ok: false, code: "invalid_selection", error: "Val saknas" };
  }
  if (typeof oddsSnapshot !== "number" || oddsSnapshot <= 1.0) {
    return { ok: false, code: "invalid_odds", error: "Ogiltiga odds" };
  }

  // ── Resolve authenticated member ──────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return mapError("unauthorized");
  }

  const { data: member } = await supabase
    .from("league_members")
    .select("id, special_wallet")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return mapError("member_not_found");
  }

  // ── Call atomic RPC ───────────────────────────────────────────────────────
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "place_special_bet",
    {
      p_member_id:      member.id,
      p_market_id:      marketId,
      p_selection_text: selectionText,
      p_stake:          stake,
      p_odds_snapshot:  oddsSnapshot,
    },
  );

  if (rpcError) {
    console.error("[placeSpecialBet] RPC error:", rpcError);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = rpcData as Record<string, unknown>;

  // ── Map RPC errors ────────────────────────────────────────────────────────
  if (result.error) {
    const code = result.error as string;

    if (code === "odds_changed") {
      return mapError(code, {
        currentOdds: result.current_odds != null ? Number(result.current_odds) : undefined,
      });
    }

    if (code === "insufficient_balance") {
      return mapError(code, {
        balance: result.balance != null ? Number(result.balance) : undefined,
      });
    }

    return mapError(code);
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return {
    ok:              true,
    specialBetId:    result.special_bet_id as string,
    version:         result.version as number,
    oddsSnapshot:    Number(result.odds_snapshot),
    potentialPayout: result.potential_payout as number,
  };
}

// ─── cancelSpecialBet ─────────────────────────────────────────────────────────
// Cancels an active special bet and refunds the stake to special_wallet.
// Only the owning player can cancel (verified via auth.uid() in RPC).

export async function cancelSpecialBet(betId: string): Promise<CancelSpecialBetResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unauthorized", error: RPC_ERRORS.unauthorized };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "cancel_special_bet",
    { p_bet_id: betId },
  );

  if (rpcError) {
    console.error("[cancelSpecialBet] RPC error:", rpcError);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = rpcData as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;
    return {
      ok:    false,
      code,
      error: RPC_ERRORS[code] ?? "Något gick fel — försök igen",
    };
  }

  return { ok: true };
}
