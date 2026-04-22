"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOdds } from "@/lib/sync/odds";
import { syncResults } from "@/lib/sync/results";
import type { TournamentStatus, MatchStatus } from "@/types";

export type ActionState = { error: string } | { success: string } | null;

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) return null;
  return { supabase, user, leagueId: member.league_id as string };
}

async function writeAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? null,
  });
}

// ─── Invite to whitelist ──────────────────────────────────────────────────────

export async function inviteUser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const email = (formData.get("email") as string | null)?.toLowerCase().trim();
  if (!email) return { error: "E-post saknas" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Ogiltig e-postadress" };

  const { error } = await ctx.supabase
    .from("invite_whitelist")
    .insert({ email, invited_by: ctx.user.id });

  if (error) {
    if (error.code === "23505") return { error: "E-posten finns redan i whitelist" };
    return { error: "Kunde inte lägga till inbjudan" };
  }

  await writeAuditLog(ctx.supabase, ctx.user.id, "whitelist_add", "invite_whitelist", null, { email });
  revalidatePath("/admin");
  return { success: `${email} tillagd i whitelist` };
}

export async function removeFromWhitelist(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const id = formData.get("id") as string;
  const email = formData.get("email") as string;

  const { error } = await ctx.supabase
    .from("invite_whitelist")
    .delete()
    .eq("id", id);

  if (error) return { error: "Kunde inte ta bort inbjudan" };

  await writeAuditLog(ctx.supabase, ctx.user.id, "whitelist_remove", "invite_whitelist", id, { email });
  revalidatePath("/admin");
  return { success: `${email} borttagen från whitelist` };
}

// ─── Create manual account ────────────────────────────────────────────────────

export async function createManualUser(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const email = (formData.get("email") as string | null)?.toLowerCase().trim();
  const displayName = (formData.get("display_name") as string | null)?.trim();
  const password = formData.get("password") as string | null;

  if (!email) return { error: "E-post saknas" };
  if (!displayName) return { error: "Visningsnamn saknas" };
  if (!password || password.length < 8) return { error: "Lösenordet måste vara minst 8 tecken" };

  const adminClient = createAdminClient();

  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { display_name: displayName },
      email_confirm: true,
    });

  if (authError) {
    if (authError.message?.includes("already registered"))
      return { error: "E-posten används redan" };
    return { error: "Kunde inte skapa konto" };
  }

  const newUserId = authData.user.id;

  // Add to league (trigger has already created the profile)
  const { error: memberError } = await ctx.supabase
    .from("league_members")
    .insert({
      league_id: ctx.leagueId,
      user_id: newUserId,
      role: "player",
      match_wallet: 5000,
      special_wallet: 1000,
    });

  if (memberError) {
    // Rollback: delete the auth user
    await adminClient.auth.admin.deleteUser(newUserId);
    return { error: "Kunde inte lägga till i ligan" };
  }

  await writeAuditLog(ctx.supabase, ctx.user.id, "create_manual_user", "profiles", newUserId, {
    email,
    display_name: displayName,
  });

  revalidatePath("/admin");
  return { success: `${displayName} skapad och tillagd i ligan` };
}

// ─── Toggle member active ─────────────────────────────────────────────────────

export async function toggleMemberActive(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const memberId = formData.get("member_id") as string;
  const userId = formData.get("user_id") as string;
  const newActive = formData.get("new_active") === "true";
  const displayName = formData.get("display_name") as string;

  // Prevent admin from deactivating themselves
  if (userId === ctx.user.id) return { error: "Du kan inte inaktivera ditt eget konto" };

  const { error } = await ctx.supabase
    .from("league_members")
    .update({ is_active: newActive })
    .eq("id", memberId)
    .eq("league_id", ctx.leagueId);

  if (error) return { error: "Kunde inte uppdatera spelare" };

  await writeAuditLog(
    ctx.supabase,
    ctx.user.id,
    newActive ? "member_activate" : "member_deactivate",
    "league_members",
    memberId,
    { user_id: userId, display_name: displayName }
  );

  revalidatePath("/admin");
  return { success: `${displayName} ${newActive ? "aktiverad" : "inaktiverad"}` };
}

// ─── Toggle league open/closed ────────────────────────────────────────────────

export async function toggleLeague(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const newOpen = formData.get("new_open") === "true";

  const { error } = await ctx.supabase
    .from("leagues")
    .update({ is_open: newOpen })
    .eq("id", ctx.leagueId);

  if (error) return { error: "Kunde inte uppdatera ligan" };

  await writeAuditLog(ctx.supabase, ctx.user.id, newOpen ? "league_open" : "league_close", "leagues", ctx.leagueId);
  revalidatePath("/admin");
  return { success: newOpen ? "Ligan är nu öppen" : "Ligan är nu stängd" };
}

// ─── Update tournament status ─────────────────────────────────────────────────

export async function updateTournamentStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const tournamentId = formData.get("tournament_id") as string;
  const status = formData.get("status") as TournamentStatus;

  const validStatuses: TournamentStatus[] = [
    "upcoming",
    "group_stage",
    "knockout",
    "finished",
  ];
  if (!validStatuses.includes(status)) return { error: "Ogiltig status" };

  const { error } = await ctx.supabase
    .from("tournaments")
    .update({ status })
    .eq("id", tournamentId);

  if (error) return { error: "Kunde inte uppdatera turneringen" };

  const labels: Record<TournamentStatus, string> = {
    upcoming: "Kommande",
    group_stage: "Gruppspel",
    knockout: "Slutspel",
    finished: "Avslutad",
  };

  await writeAuditLog(ctx.supabase, ctx.user.id, "tournament_status_change", "tournaments", tournamentId, { status });
  revalidatePath("/admin");
  return { success: `Turneringsstatus ändrad till "${labels[status]}"` };
}

// ─── Set match odds (admin fallback) ─────────────────────────────────────────

export async function setMatchOdds(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const matchId  = (formData.get("match_id") as string | null)?.trim();
  const homeRaw  = formData.get("home_odds") as string | null;
  const drawRaw  = formData.get("draw_odds") as string | null;
  const awayRaw  = formData.get("away_odds") as string | null;

  if (!matchId)  return { error: "Match saknas" };
  if (!homeRaw || !drawRaw || !awayRaw) return { error: "Alla odds måste fyllas i" };

  const homeOdds = parseFloat(homeRaw);
  const drawOdds = parseFloat(drawRaw);
  const awayOdds = parseFloat(awayRaw);

  if (
    isNaN(homeOdds) || homeOdds <= 1 ||
    isNaN(drawOdds) || drawOdds <= 1 ||
    isNaN(awayOdds) || awayOdds <= 1
  ) {
    return { error: "Odds måste vara tal större än 1.0" };
  }

  // Fetch match label for audit
  const { data: match } = await ctx.supabase
    .from("matches")
    .select("match_number, stage")
    .eq("id", matchId)
    .single();

  if (!match) return { error: "Matchen hittades inte" };

  const { error } = await ctx.supabase
    .from("match_odds")
    .upsert(
      {
        match_id:  matchId,
        home_odds: homeOdds,
        draw_odds: drawOdds,
        away_odds: awayOdds,
        source:    "admin",
        set_by:    ctx.user.id,
      },
      { onConflict: "match_id" }
    );

  if (error) return { error: "Kunde inte spara odds" };

  await writeAuditLog(
    ctx.supabase,
    ctx.user.id,
    "match_odds_set",
    "match_odds",
    matchId,
    { match_number: match.match_number, home_odds: homeOdds, draw_odds: drawOdds, away_odds: awayOdds }
  );

  revalidatePath("/admin");
  return { success: `Odds satta för match #${match.match_number}` };
}

// ─── Manual sync triggers ─────────────────────────────────────────────────────

export async function runOddsSync(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  try {
    const result = await syncOdds();
    await writeAuditLog(ctx.supabase, ctx.user.id, "sync_odds_manual", "match_odds", null, {
      processed: result.processed,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
    const parts: string[] = [`${result.updated} uppdaterade`];
    if (result.skipped > 0) parts.push(`${result.skipped} hoppade`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} fel`);
    return { success: `Odds-sync klar: ${parts.join(", ")} (av ${result.processed} totalt)` };
  } catch (err) {
    return { error: `Odds-sync misslyckades: ${String(err)}` };
  }
}

export async function runResultsSync(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  try {
    const result = await syncResults();
    await writeAuditLog(ctx.supabase, ctx.user.id, "sync_results_manual", "matches", null, {
      processed: result.processed,
      updated: result.updated,
      skipped: result.skipped,
      errors: result.errors,
    });
    const parts: string[] = [`${result.updated} uppdaterade`];
    if (result.skipped > 0) parts.push(`${result.skipped} hoppade`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} fel`);
    return { success: `Resultat-sync klar: ${parts.join(", ")} (av ${result.processed} totalt)` };
  } catch (err) {
    return { error: `Resultat-sync misslyckades: ${String(err)}` };
  }
}

// ─── Correct match result ─────────────────────────────────────────────────────

export async function correctMatchResult(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await getAdminContext();
  if (!ctx) return { error: "Ingen behörighet" };

  const matchId      = (formData.get("match_id") as string | null)?.trim();
  const status       = formData.get("status") as MatchStatus | null;
  const homeScoreRaw = formData.get("home_score") as string | null;
  const awayScoreRaw = formData.get("away_score") as string | null;
  const homeHtRaw    = formData.get("home_score_ht") as string | null;
  const awayHtRaw    = formData.get("away_score_ht") as string | null;

  if (!matchId) return { error: "Match saknas" };

  const validStatuses: MatchStatus[] = ["scheduled", "live", "finished", "void"];
  if (!status || !validStatuses.includes(status)) return { error: "Ogiltig matchstatus" };

  // Scores required when status is live or finished
  let homeScore: number | null = null;
  let awayScore: number | null = null;
  let homeScoreHt: number | null = null;
  let awayScoreHt: number | null = null;

  if (status === "live" || status === "finished") {
    if (!homeScoreRaw || !awayScoreRaw) return { error: "Resultat krävs för live/avslutad match" };
    homeScore = parseInt(homeScoreRaw, 10);
    awayScore = parseInt(awayScoreRaw, 10);
    if (isNaN(homeScore) || homeScore < 0) return { error: "Ogiltigt hemmaresultat" };
    if (isNaN(awayScore) || awayScore < 0) return { error: "Ogiltigt bortaresultat" };

    if (homeHtRaw !== null && homeHtRaw !== "") {
      homeScoreHt = parseInt(homeHtRaw, 10);
      if (isNaN(homeScoreHt) || homeScoreHt < 0) return { error: "Ogiltigt HT hemmaresultat" };
    }
    if (awayHtRaw !== null && awayHtRaw !== "") {
      awayScoreHt = parseInt(awayHtRaw, 10);
      if (isNaN(awayScoreHt) || awayScoreHt < 0) return { error: "Ogiltigt HT bortaresultat" };
    }
  }

  // Fetch current match for audit
  const { data: match } = await ctx.supabase
    .from("matches")
    .select("match_number, stage, status, home_score, away_score")
    .eq("id", matchId)
    .single();

  if (!match) return { error: "Matchen hittades inte" };

  const { error } = await ctx.supabase
    .from("matches")
    .update({
      status,
      home_score:    homeScore,
      away_score:    awayScore,
      home_score_ht: homeScoreHt,
      away_score_ht: awayScoreHt,
    })
    .eq("id", matchId);

  if (error) return { error: "Kunde inte uppdatera matchresultat" };

  await writeAuditLog(
    ctx.supabase,
    ctx.user.id,
    "match_result_set",
    "matches",
    matchId,
    {
      match_number: match.match_number,
      status,
      home_score: homeScore,
      away_score: awayScore,
      prev_status: match.status,
      prev_home:   match.home_score,
      prev_away:   match.away_score,
    }
  );

  revalidatePath("/admin");
  revalidatePath("/matcher");
  return { success: `Resultat uppdaterat för match #${match.match_number}` };
}
