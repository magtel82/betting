import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ authenticated: false, userError });
  }

  const { data: member, error: memberError } = await supabase
    .from("league_members")
    .select("id, match_wallet, is_active, league_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  // Try a minimal RPC call to test execute permissions
  const { data: rpcData, error: rpcError } = member
    ? await supabase.rpc("place_bet_slip", {
        p_league_member_id: member.id,
        p_stake: 10,
        p_selections: [],
      })
    : { data: null, error: null };

  return Response.json({
    userId: user.id,
    member,
    memberError,
    rpcData,
    rpcError,
  });
}
