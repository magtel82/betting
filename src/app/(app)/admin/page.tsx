import { requireAdmin } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { LeagueControls } from "./_components/LeagueControls";
import { MemberList } from "./_components/MemberList";
import { InviteForm } from "./_components/InviteForm";
import { CreateUserForm } from "./_components/CreateUserForm";
import { AuditLogSection } from "./_components/AuditLogSection";
import { MatchOddsForm } from "./_components/MatchOddsForm";
import { MatchResultForm } from "./_components/MatchResultForm";
import { SyncStatusSection, type SyncLogRow } from "./_components/SyncStatusSection";
import { SettlePanel } from "./_components/SettlePanel";
import { EconomyPanel } from "./_components/EconomyPanel";
import { SpecialOddsForm } from "./_components/SpecialOddsForm";
import { SpecialSettlePanel, type MarketWithBets } from "./_components/SpecialSettlePanel";
import { TopScorerAdmin, type TopScorerRow } from "./_components/TopScorerAdmin";
import type {
  League,
  Tournament,
  LeagueMemberWithProfile,
  InviteWhitelist,
  AuditLog,
  MatchWithTeams,
  MatchOdds,
  SpecialMarket,
} from "@/types";

export default async function AdminPage() {
  const { supabase, user, member } = await requireAdmin();
  const leagueId = member.league_id;

  const [membersRes, whitelistRes, leagueRes, auditRes, matchesRes, settleMatchesRes, syncLogRes] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("*, profile:profiles(*)")
        .eq("league_id", leagueId)
        .order("joined_at"),
      supabase
        .from("invite_whitelist")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("leagues")
        .select("*, tournament:tournaments(*)")
        .eq("id", leagueId)
        .single(),
      supabase
        .from("audit_log")
        .select("*, actor:profiles(display_name)")
        .order("created_at", { ascending: false })
        .limit(50),
      // Scheduled/live/finished matches for odds + result forms
      supabase
        .from("matches")
        .select(
          "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), odds:match_odds(*)"
        )
        .neq("status", "void")
        .order("scheduled_at"),
      // Finished + void matches for settlement panel
      supabase
        .from("matches")
        .select(
          "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*)"
        )
        .in("status", ["finished", "void"])
        .order("scheduled_at", { ascending: false })
        .limit(30),
      // Sync history — last 20 entries (10 per type shown in UI)
      supabase
        .from("sync_log")
        .select("id, type, ran_at, processed, updated, skipped, errors, duration_ms")
        .order("ran_at", { ascending: false })
        .limit(20),
    ]);

  const members = (membersRes.data ?? []) as LeagueMemberWithProfile[];
  const whitelist = (whitelistRes.data ?? []) as InviteWhitelist[];
  const leagueWithTournament = leagueRes.data as
    | (League & { tournament: Tournament })
    | null;

  // Fetch special markets + active bets for the tournament (sequential — needs tournament_id)
  const tournamentId = leagueWithTournament?.tournament.id;
  const { data: marketsData } = tournamentId
    ? await supabase
        .from("special_markets")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("created_at")
    : { data: [] };
  const specialMarkets = (marketsData ?? []) as SpecialMarket[];

  // Fetch active bets for settlement panel (admin sees all via RLS)
  const { data: activeBetsData } = specialMarkets.length > 0
    ? await supabase
        .from("special_bets")
        .select("market_id, selection_text")
        .in("market_id", specialMarkets.map((m) => m.id))
        .eq("status", "active")
    : { data: [] };

  // Group active bets by market, then by selection_text with counts
  const betsByMarket = new Map<string, Map<string, number>>();
  for (const bet of activeBetsData ?? []) {
    const selMap = betsByMarket.get(bet.market_id) ?? new Map<string, number>();
    selMap.set(bet.selection_text, (selMap.get(bet.selection_text) ?? 0) + 1);
    betsByMarket.set(bet.market_id, selMap);
  }

  const marketsWithBets: MarketWithBets[] = specialMarkets.map((m) => ({
    ...m,
    activeBets: Array.from(betsByMarket.get(m.id)?.entries() ?? [])
      .map(([selection_text, count]) => ({ selection_text, count }))
      .sort((a, b) => b.count - a.count),
  }));

  // Fetch top scorer (skyttekung) outright_odds for admin management
  const skyttekungMarket = specialMarkets.find((m) => m.type === "skyttekung");
  const { data: skyttekungOddsData } = skyttekungMarket
    ? await supabase
        .from("outright_odds")
        .select("selection, odds, source")
        .eq("market_id", skyttekungMarket.id)
        .order("odds", { ascending: true })
    : { data: [] as { selection: string; odds: number; source: string }[] };
  const skyttekungPlayers: TopScorerRow[] = (skyttekungOddsData ?? []).map((r) => ({
    selection: r.selection,
    odds:      Number(r.odds),
    source:    r.source,
  }));

  const auditEntries = (auditRes.data ?? []) as (AuditLog & {
    actor: { display_name: string } | null;
  })[];

  // Normalise the odds join: Supabase returns array for one-to-many even with unique constraint
  const rawMatches = (matchesRes.data ?? []) as (MatchWithTeams & {
    odds: MatchOdds[] | MatchOdds | null;
  })[];
  const matchesWithOdds = rawMatches.map((m) => ({
    ...m,
    odds: Array.isArray(m.odds) ? (m.odds[0] ?? null) : m.odds,
  }));

  const settleMatches = (settleMatchesRes.data ?? []) as MatchWithTeams[];
  const syncLogs = (syncLogRes.data ?? []) as unknown as SyncLogRow[];

  // Today's date in Swedish time, for the inactivity fee date picker default
  const todaySwedish = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  if (!leagueWithTournament) {
    return (
      <>
        <TopBar title="Admin" showBack />
        <div className="mx-auto max-w-lg px-4 py-6">
          <p className="text-[var(--loss)]">Kunde inte hämta ligadata.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Admin" showBack />
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Liga & turnering */}
        <LeagueControls
          league={leagueWithTournament as League}
          tournament={leagueWithTournament.tournament}
        />

        {/* Sync & Status */}
        <SyncStatusSection initialLogs={syncLogs} />

        {/* Match-settlement: Steg 1 (sätt resultat) + Steg 2 (avgör slip) */}
        {matchesWithOdds.length > 0 && (
          <MatchResultForm matches={matchesWithOdds} />
        )}
        <SettlePanel matches={settleMatches} />

        {/* Ekonomi: lås slip, inaktivitetsavgift, gruppbonus */}
        <EconomyPanel defaultFeeDate={todaySwedish} />

        {/* Specialbet-odds */}
        {tournamentId && (
          <SpecialOddsForm
            tournamentId={tournamentId}
            markets={specialMarkets}
          />
        )}

        {/* Skyttekung-lista */}
        {skyttekungMarket && (
          <TopScorerAdmin
            marketId={skyttekungMarket.id}
            players={skyttekungPlayers}
          />
        )}

        {/* Specialbet-settlement */}
        {marketsWithBets.length > 0 && (
          <SpecialSettlePanel markets={marketsWithBets} />
        )}

        {/* Matchodds – manuell fallback */}
        {matchesWithOdds.length > 0 && (
          <MatchOddsForm matches={matchesWithOdds} />
        )}

        {/* Spelaröversikt */}
        <MemberList members={members} currentUserId={user.id} />

        {/* Inbjudningar */}
        <InviteForm whitelist={whitelist} />

        {/* Skapa manuellt konto */}
        <CreateUserForm />

        {/* Audit-logg */}
        <AuditLogSection entries={auditEntries} />
      </div>
    </>
  );
}
