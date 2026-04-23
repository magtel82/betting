import { requireAdmin } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { LeagueControls } from "./_components/LeagueControls";
import { MemberList } from "./_components/MemberList";
import { InviteForm } from "./_components/InviteForm";
import { CreateUserForm } from "./_components/CreateUserForm";
import { AuditLogSection } from "./_components/AuditLogSection";
import { MatchOddsForm } from "./_components/MatchOddsForm";
import { MatchResultForm } from "./_components/MatchResultForm";
import { SyncPanel } from "./_components/SyncPanel";
import { SettlePanel } from "./_components/SettlePanel";
import { EconomyPanel } from "./_components/EconomyPanel";
import type {
  League,
  Tournament,
  LeagueMemberWithProfile,
  InviteWhitelist,
  AuditLog,
  MatchWithTeams,
  MatchOdds,
} from "@/types";

export default async function AdminPage() {
  const { supabase, user, member } = await requireAdmin();
  const leagueId = member.league_id;

  const [membersRes, whitelistRes, leagueRes, auditRes, matchesRes, settleMatchesRes] =
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
    ]);

  const members = (membersRes.data ?? []) as LeagueMemberWithProfile[];
  const whitelist = (whitelistRes.data ?? []) as InviteWhitelist[];
  const leagueWithTournament = leagueRes.data as
    | (League & { tournament: Tournament })
    | null;
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
          <p className="text-red-500">Kunde inte hämta ligadata.</p>
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

        {/* Manuell sync */}
        <SyncPanel />

        {/* Settlement */}
        {settleMatches.length > 0 && (
          <SettlePanel matches={settleMatches} />
        )}

        {/* Ekonomi: lås slip, inaktivitetsavgift, gruppbonus */}
        <EconomyPanel defaultFeeDate={todaySwedish} />

        {/* Matchodds – manuell fallback */}
        {matchesWithOdds.length > 0 && (
          <MatchOddsForm matches={matchesWithOdds} />
        )}

        {/* Matchresultat – manuell rättning */}
        {matchesWithOdds.length > 0 && (
          <MatchResultForm matches={matchesWithOdds} />
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
