"use server";

import { revalidatePath } from "next/cache";
import { placeSpecialBet, cancelSpecialBet } from "@/lib/betting/place-special-bet";
import type { PlaceSpecialBetResult, CancelSpecialBetResult } from "@/lib/betting/place-special-bet";

export type PlaceActionState   = PlaceSpecialBetResult | null;
export type CancelActionState  = CancelSpecialBetResult | null;

export async function placeSpecialBetAction(
  _prev: PlaceActionState,
  formData: FormData,
): Promise<PlaceActionState> {
  const marketId      = (formData.get("market_id")      as string | null) ?? "";
  const selectionText = ((formData.get("selection_text") as string | null) ?? "").trim();
  const stake         = parseInt((formData.get("stake")         as string | null) ?? "0", 10);
  const oddsSnapshot  = parseFloat((formData.get("odds_snapshot") as string | null) ?? "0");

  const result = await placeSpecialBet({ marketId, selectionText, stake, oddsSnapshot });
  if (result.ok) revalidatePath("/specialbet");
  return result;
}

export async function cancelSpecialBetAction(
  _prev: CancelActionState,
  formData: FormData,
): Promise<CancelActionState> {
  const betId  = (formData.get("bet_id") as string | null) ?? "";
  const result = await cancelSpecialBet(betId);
  if (result.ok) revalidatePath("/specialbet");
  return result;
}
