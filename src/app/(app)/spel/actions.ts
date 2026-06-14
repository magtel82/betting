"use server";

import { revalidatePath } from "next/cache";
import { submitPenaltyScore, type SubmitScoreResult } from "@/lib/games/penalty";

export async function submitPenaltyScoreAction(score: number): Promise<SubmitScoreResult> {
  const result = await submitPenaltyScore(score);
  if (result.ok) revalidatePath("/spel");
  return result;
}
