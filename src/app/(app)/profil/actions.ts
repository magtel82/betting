"use server";

import { requireActiveUser } from "@/lib/auth";

export async function updateDisplayNameAction(
  displayName: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireActiveUser();

  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 30) {
    return { ok: false, error: "Namn måste vara 2–30 tecken" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", user.id);

  if (error) return { ok: false, error: "Kunde inte spara, försök igen" };
  return { ok: true };
}
