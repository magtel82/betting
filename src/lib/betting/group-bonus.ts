import { createAdminClient } from "@/lib/supabase/admin";

export interface BonusEntry {
  memberId:   string;
  placement:  number;
  bonus:      number;
  totalCoins: number;
}

export type GroupBonusResult =
  | { ok: true; bonuses: BonusEntry[] }
  | { ok: true; skipped: "already_applied" }
  | { ok: false; error: string; code: string };

const BONUS_ERRORS: Record<string, string> = {
  league_not_found:       "Ligan hittades inte",
  group_stage_not_complete:
    "Alla gruppspelsmatcher måste vara avgjorda eller ogiltigförklarade innan bonus kan delas ut",
};

export async function applyGroupBonus(leagueId: string): Promise<GroupBonusResult> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("apply_group_bonus", {
    p_league_id: leagueId,
  });

  if (error) {
    console.error("[applyGroupBonus] RPC error:", error);
    return { ok: false, code: "rpc_error", error: "Internt fel — försök igen" };
  }

  const result = data as Record<string, unknown>;

  if (result.error) {
    const code = result.error as string;
    return { ok: false, code, error: BONUS_ERRORS[code] ?? "Något gick fel" };
  }

  if (result.skipped === "already_applied") {
    return { ok: true, skipped: "already_applied" };
  }

  const raw = (result.bonuses as Record<string, unknown>[]) ?? [];
  const bonuses: BonusEntry[] = raw.map((b) => ({
    memberId:   b.member_id   as string,
    placement:  b.placement   as number,
    bonus:      b.bonus       as number,
    totalCoins: b.total_coins as number,
  }));

  return { ok: true, bonuses };
}
