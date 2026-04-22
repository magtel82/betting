"use server";

import { placeSlip, type SelectionInput, type PlaceSlipResult } from "@/lib/betting/place-slip";

// Re-export types for UI components in fas 5B
export type { SelectionInput, PlaceSlipResult };

// ─── placeSlipAction ─────────────────────────────────────────────────────────
// Server Action wrapper for placing a matchslip.
// Called from the /bet UI once it is built in fas 5B.
//
// selections: 1–5 match picks with outcome and the odds the player saw
// stake:      whole number of coins (integer, min 10)

export async function placeSlipAction(
  selections: SelectionInput[],
  stake:      number,
): Promise<PlaceSlipResult> {
  return placeSlip(selections, stake);
}
