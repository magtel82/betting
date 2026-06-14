import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { PenaltyGame } from "./_components/PenaltyGame";

// Unlisted on purpose — reachable by URL (/spel) but not linked anywhere yet.
export const metadata = { title: "Straffspel" };

type ProfileRow = { display_name: string; email: string | null };
type MemberRow  = { id: string; user_id: string; profile: ProfileRow | ProfileRow[] | null };

function memberName(profile: ProfileRow | ProfileRow[] | null): string {
  const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
  if (!p) return "Okänd";
  const raw = p.display_name;
  if (raw && !raw.includes("@")) return raw;
  const prefix = p.email?.split("@")[0];
  return prefix ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : "Okänd";
}

export type LeaderRow = {
  memberId: string;
  name: string;
  best: number;
  games: number;
  isMe: boolean;
};

export default async function SpelPage() {
  const { supabase, user } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, league_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return (
      <>
        <TopBar title="Straffspel" />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-sm text-gray-400">Du är inte med i någon liga ännu.</p>
        </div>
      </>
    );
  }

  const [scoresRes, membersRes] = await Promise.all([
    supabase.rpc("get_penalty_leaderboard", { p_league_id: member.league_id }),
    supabase
      .from("league_members")
      .select("id, user_id, profile:profiles(display_name, email)")
      .eq("league_id", member.league_id as string)
      .eq("is_active", true),
  ]);

  const members = (membersRes.data ?? []) as unknown as MemberRow[];
  const nameById = new Map(members.map((m) => [m.id, memberName(m.profile)]));

  const scores = (scoresRes.data ?? []) as { league_member_id: string; best_score: number; games_played: number }[];

  const leaderboard: LeaderRow[] = scores
    .map((s) => ({
      memberId: s.league_member_id,
      name:     nameById.get(s.league_member_id) ?? "Okänd",
      best:     s.best_score,
      games:    s.games_played,
      isMe:     s.league_member_id === member.id,
    }))
    .sort((a, b) => b.best - a.best || a.name.localeCompare(b.name, "sv"));

  return (
    <>
      <TopBar title="Straffspel" />
      <div className="mx-auto max-w-lg px-4 py-5">
        <PenaltyGame leaderboard={leaderboard} hasPlayed={leaderboard.some((r) => r.isMe)} />
      </div>
    </>
  );
}
