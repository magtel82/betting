import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/BottomNav";
import { UserMenu } from "@/components/nav/UserMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = "Okänd";
  let coins = 0;

  if (user) {
    const [{ data: profile }, { data: member }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("league_members")
        .select("match_wallet, special_wallet")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single(),
    ]);

    displayName =
      (profile?.display_name as string | null) ??
      user.email?.split("@")[0] ??
      "Okänd";

    coins =
      ((member?.match_wallet as number | null) ?? 0) +
      ((member?.special_wallet as number | null) ?? 0);
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Persistent user strip — sticky, always visible above page header */}
      <div className="sticky top-0 z-50 h-9 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-full max-w-lg items-center justify-between px-4">
          <span className="text-xs font-semibold tracking-wide text-gray-300">VM BET</span>
          <UserMenu displayName={displayName} coins={coins} />
        </div>
      </div>

      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
