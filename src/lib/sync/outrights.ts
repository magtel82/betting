// ─── Outright odds sync ────────────────────────────────────────────────────────
// Fetches per-selection odds for vm_vinnare and skyttekung from The Odds API
// and upserts into the outright_odds table.
//
// vm_vinnare:  soccer_fifa_world_cup_winner / outrights
//              Team names mapped via TEAM_NAME_TO_DB (English → Swedish).
//
// skyttekung:  soccer_fifa_world_cup / top_goalscorer
//              Player names kept as-is (no mapping needed).
//
// Idempotent: every run upserts on (market_id, selection).
// Non-fatal: if one market fails the other still runs.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchOutrightOdds,
  aggregateOutrightOdds,
  OddsApiError,
  WINNER_SPORT_KEY,
  GOALSCORER_SPORT_KEY,
} from "@/lib/adapters/odds-api";
import { resolveTeamDbName } from "./team-map";
import { emptySyncResult, type SyncResult } from "./types";

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncOutrights(): Promise<SyncResult> {
  const result = emptySyncResult("the-odds-api");
  const db = createAdminClient();

  // 1. Find active tournament + its special markets
  const { data: tournaments } = await db
    .from("tournaments")
    .select("id")
    .limit(1);

  const tournamentId = tournaments?.[0]?.id as string | undefined;
  if (!tournamentId) {
    result.errors.push("No tournament found");
    return result;
  }

  const { data: markets } = await db
    .from("special_markets")
    .select("id, type")
    .eq("tournament_id", tournamentId)
    .in("type", ["vm_vinnare", "skyttekung"]);

  if (!markets || markets.length === 0) {
    result.errors.push("No vm_vinnare or skyttekung markets found for tournament");
    return result;
  }

  const winnerMarket     = markets.find((m) => m.type === "vm_vinnare");
  const goalscorerMarket = markets.find((m) => m.type === "skyttekung");

  // 2. Sync VM-vinnare (soccer_fifa_world_cup_winner / outrights)
  if (winnerMarket) {
    const { updated, skipped, errors } = await syncMarketOutrights(
      db,
      winnerMarket.id,
      WINNER_SPORT_KEY,
      "outrights",
      resolveTeamDbName,
    );
    result.updated  += updated;
    result.skipped  += skipped;
    result.errors.push(...errors);
    result.processed++;
  }

  // 3. Sync skyttekung (soccer_fifa_world_cup / top_goalscorer) — may not exist
  if (goalscorerMarket) {
    const { updated, skipped, errors } = await syncMarketOutrights(
      db,
      goalscorerMarket.id,
      GOALSCORER_SPORT_KEY,
      "top_goalscorer",
      (name) => name, // keep player names as-is
    );
    result.updated  += updated;
    result.skipped  += skipped;
    result.errors.push(...errors);
    result.processed++;
  }

  return result;
}

// ─── Per-market sync helper ───────────────────────────────────────────────────

async function syncMarketOutrights(
  db: ReturnType<typeof createAdminClient>,
  marketId: string,
  sportKey: string,
  marketKey: string,
  resolveName: (name: string) => string | null,
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const updated: number[] = [];
  let skipped = 0;
  const errors: string[] = [];

  // Fetch from API
  let events;
  try {
    events = await fetchOutrightOdds(sportKey, marketKey);
  } catch (err) {
    const msg = err instanceof OddsApiError ? err.message : String(err);
    errors.push(`API fetch failed (${sportKey}/${marketKey}): ${msg}`);
    return { updated: 0, skipped: 0, errors };
  }

  if (events.length === 0) {
    errors.push(`No events returned for ${sportKey}/${marketKey}`);
    return { updated: 0, skipped: 0, errors };
  }

  // Aggregate odds across bookmakers
  const selections = aggregateOutrightOdds(events, marketKey);
  if (selections.length === 0) {
    errors.push(`No ${marketKey} outcomes found in API response for ${sportKey}`);
    return { updated: 0, skipped: 0, errors };
  }

  console.log(`[sync/outrights] ${sportKey}/${marketKey}: ${selections.length} selections`);

  // Map names and upsert
  const rows: { market_id: string; selection: string; odds: number; source: string; synced_at: string }[] = [];
  const now = new Date().toISOString();

  for (const { selection, odds } of selections) {
    const mapped = resolveName(selection);
    if (!mapped) {
      console.warn(`[sync/outrights] Unknown name "${selection}" — skipping`);
      skipped++;
      continue;
    }
    rows.push({ market_id: marketId, selection: mapped, odds, source: "the-odds-api", synced_at: now });
  }

  if (rows.length === 0) {
    errors.push(`All selections unmapped for ${sportKey}/${marketKey}`);
    return { updated: 0, skipped, errors };
  }

  // Protect admin-managed entries — never overwrite source='admin' rows
  const { data: adminRows } = await db
    .from("outright_odds")
    .select("selection")
    .eq("market_id", marketId)
    .eq("source", "admin");
  const adminProtected = new Set(
    (adminRows ?? []).map((r: { selection: string }) => r.selection.toLowerCase().trim()),
  );
  const filteredRows = rows.filter(
    (r) => !adminProtected.has(r.selection.toLowerCase().trim()),
  );
  if (filteredRows.length === 0) {
    console.log(`[sync/outrights] All ${rows.length} rows are admin-managed — skipping upsert`);
    return { updated: 0, skipped: rows.length, errors };
  }

  const { error: upsertErr } = await db
    .from("outright_odds")
    .upsert(filteredRows, { onConflict: "market_id,selection" });

  if (upsertErr) {
    errors.push(`DB upsert failed for ${sportKey}/${marketKey}: ${upsertErr.message}`);
    return { updated: 0, skipped, errors };
  }

  const adminSkipped = rows.length - filteredRows.length;
  console.log(`[sync/outrights] Upserted ${filteredRows.length} rows for ${sportKey}/${marketKey} (${adminSkipped} admin-protected skipped)`);
  return { updated: filteredRows.length, skipped: skipped + adminSkipped, errors };
}
