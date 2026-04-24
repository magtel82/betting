import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { SpecialbetPage } from "./_components/SpecialbetPage";
import type { SpecialMarket, SpecialBet } from "@/types";

export default async function SpecialbetRoute() {
  const { supabase, user } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, special_wallet, league_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!member) {
    return (
      <>
        <TopBar title="Specialbet" />
        <div className="mx-auto max-w-lg px-4 py-6">
          <p className="text-gray-500">Du är inte med i någon liga ännu.</p>
        </div>
      </>
    );
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("tournament_id")
    .eq("id", member.league_id)
    .single();

  const tournamentId = league?.tournament_id as string | undefined;

  const [tournamentRes, marketsRes, betsRes] = await Promise.all([
    tournamentId
      ? supabase.from("tournaments").select("special_bets_deadline").eq("id", tournamentId).single()
      : Promise.resolve({ data: null }),
    tournamentId
      ? supabase.from("special_markets").select("*").eq("tournament_id", tournamentId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("special_bets")
      .select("*")
      .eq("league_member_id", member.id)
      .eq("status", "active"),
  ]);

  return (
    <>
      <TopBar title="Specialbet" />
      <SpecialbetPage
        specialWallet={member.special_wallet}
        deadline={(tournamentRes.data as { special_bets_deadline: string | null } | null)?.special_bets_deadline ?? null}
        markets={(marketsRes.data ?? []) as SpecialMarket[]}
        activeBets={(betsRes.data ?? []) as SpecialBet[]}
      />
    </>
  );
}
