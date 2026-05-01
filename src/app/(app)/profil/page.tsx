import { requireActiveUser } from "@/lib/auth";
import { TopBar } from "@/components/nav/TopBar";
import { logoutAction } from "@/app/actions";

export default async function ProfilPage() {
  const { supabase, user, profile } = await requireActiveUser();

  const { data: member } = await supabase
    .from("league_members")
    .select("match_wallet, special_wallet, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  const matchWallet   = (member?.match_wallet   as number | null) ?? 0;
  const specialWallet = (member?.special_wallet as number | null) ?? 0;
  const isAdmin       = member?.role === "admin";

  return (
    <>
      <TopBar title="Profil" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">

        {/* Identity card */}
        <section className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-600">
              {profile.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{profile.display_name}</p>
              <p className="truncate text-sm text-gray-400">{user.email}</p>
              {isAdmin && (
                <span className="mt-0.5 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Admin
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Wallet */}
        <section className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">Saldo</p>
          <div className="grid grid-cols-3 divide-x divide-gray-100 text-center">
            <div>
              <p className="tabular-nums text-lg font-bold text-gray-900">
                {(matchWallet + specialWallet).toLocaleString("sv-SE")}
              </p>
              <p className="text-xs text-gray-400">Totalt 🪙</p>
            </div>
            <div>
              <p className="tabular-nums text-lg font-bold text-gray-900">
                {matchWallet.toLocaleString("sv-SE")}
              </p>
              <p className="text-xs text-gray-400">Match</p>
            </div>
            <div>
              <p className="tabular-nums text-lg font-bold text-gray-900">
                {specialWallet.toLocaleString("sv-SE")}
              </p>
              <p className="text-xs text-gray-400">Special</p>
            </div>
          </div>
        </section>

        {/* Logout */}
        <section>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 active:bg-red-200"
            >
              Logga ut
            </button>
          </form>
        </section>

      </div>
    </>
  );
}
