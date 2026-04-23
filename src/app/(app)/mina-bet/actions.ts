"use server";

import { revalidatePath } from "next/cache";
import { cancelSlip, type CancelSlipResult } from "@/lib/betting/cancel-slip";

// ─── deleteSlipAction ─────────────────────────────────────────────────────────
// Server Action for the "Ta bort" flow in /mina-bet.
// Atomically cancels the slip and refunds the stake.

export async function deleteSlipAction(slipId: string): Promise<CancelSlipResult> {
  const result = await cancelSlip(slipId);

  if (result.ok) {
    revalidatePath("/mina-bet");
    revalidatePath("/bet");
  }

  return result;
}
