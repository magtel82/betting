import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LeagueMember, Profile } from "@/types";

export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireActiveUser() {
  const { supabase, user } = await requireAuth();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Global auth gate: blocked by whitelist check or manually deactivated globally
  if (!profile || !profile.is_active) redirect("/login?error=not_invited");

  // League-level gate: if the user has league memberships but all are inactive,
  // they have been soft-deactivated. New whitelisted users with no memberships
  // yet are allowed through (admin adds them separately).
  const { data: memberships } = await supabase
    .from("league_members")
    .select("id, is_active")
    .eq("user_id", user.id);

  if (
    memberships &&
    memberships.length > 0 &&
    !memberships.some((m) => m.is_active)
  ) {
    redirect("/login?error=not_invited");
  }

  return { supabase, user, profile: profile as Profile };
}

// Returns the user's first admin membership (MVP: one league).
export async function requireAdmin() {
  const { supabase, user, profile } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("*")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) redirect("/");

  return { supabase, user, profile, member: member as LeagueMember };
}
