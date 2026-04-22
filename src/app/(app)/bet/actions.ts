"use server";

import { revalidatePath } from "next/cache";
import { placeSlip, type SelectionInput, type PlaceSlipResult } from "@/lib/betting/place-slip";

// Re-export types for UI components
export type { SelectionInput, PlaceSlipResult };

// ─── placeSlipAction ─────────────────────────────────────────────────────────
// Server Action wrapper for placing a matchslip.
// On success, revalidates /bet so the wallet balance is fresh on next render.

export async function placeSlipAction(
  selections: SelectionInput[],
  stake:      number,
): Promise<PlaceSlipResult> {
  const result = await placeSlip(selections, stake);

  if (result.ok) {
    // Refresh server data: wallet balance changed, and /mina-bet will need
    // the new slip once that page is built in fas 5C.
    revalidatePath("/bet");
  }

  return result;
}
