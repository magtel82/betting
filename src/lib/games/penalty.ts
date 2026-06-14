// ─── penalty.ts ───────────────────────────────────────────────────────────────
// Server-side logic for the penalty mini-game. Score persistence happens in the
// submit_penalty_score Postgres RPC (SECURITY DEFINER) so member resolution and
// best-score logic stay atomic. Must run from server context (Server Action).

import { createClient } from "@/lib/supabase/server";

export type SubmitScoreResult =
  | { ok: true; best: number; score: number; isRecord: boolean }
  | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  invalid_score:    "Ogiltig poäng",
  member_not_found: "Ditt ligamedlemskap hittades inte",
};

export async function submitPenaltyScore(score: number): Promise<SubmitScoreResult> {
  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, error: ERRORS.invalid_score };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_penalty_score", {
    p_score: Math.floor(score),
  });

  if (error) {
    console.error("[submitPenaltyScore] RPC error:", error);
    return { ok: false, error: "Internt fel — försök igen" };
  }

  const res = data as Record<string, unknown>;
  if (!res.ok) {
    const code = res.error as string;
    return { ok: false, error: ERRORS[code] ?? "Något gick fel" };
  }

  return {
    ok:       true,
    best:     res.best as number,
    score:    res.score as number,
    isRecord: res.is_record as boolean,
  };
}
