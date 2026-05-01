"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "Du är inte inbjuden till denna app.",
  auth_error:  "Inloggningen misslyckades. Försök igen.",
  inactive:    "Ditt konto har inaktiverats. Kontakta admin.",
};

export function LoginForm({ errorParam }: { errorParam?: string }) {
  const router = useRouter();
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isPending,  setIsPending]  = useState(false);

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const email    = formData.get("email")    as string;
    const password = formData.get("password") as string;

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setEmailError("Fel e-postadress eller lösenord.");
      setIsPending(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const bannerError = errorParam ? ERROR_MESSAGES[errorParam] : null;

  return (
    <div className="w-full max-w-sm">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/20">
          <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9" aria-hidden>
            <path d="M3 12 L12 3 L21 12 L12 21 Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3.5" fill="white" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">VM Bet 2026</h1>
        <p className="mt-1 text-sm text-gray-500">Välkommen tillbaka — logga in för att fortsätta</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        {bannerError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-100 bg-[var(--loss-50)] px-3 py-2.5 text-sm text-[var(--loss)]">
            <span aria-hidden>⚠</span>
            <span className="font-medium">{bannerError}</span>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
        >
          <GoogleIcon />
          <span>Fortsätt med Google</span>
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">eller med e-post</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">E-postadress</span>
            <input
              name="email"
              type="email"
              placeholder="namn@exempel.se"
              required
              autoComplete="email"
              className="h-12 w-full rounded-lg border border-gray-200 px-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Lösenord</span>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="h-12 w-full rounded-lg border border-gray-200 px-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            />
          </label>
          {emailError && (
            <p className="text-sm font-medium text-[var(--loss)]">{emailError}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="h-12 w-full rounded-lg bg-[var(--primary)] text-sm font-bold text-white shadow-sm transition-colors hover:bg-[var(--primary-600)] active:bg-[var(--primary-600)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Loggar in…" : "Logga in"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[11px] text-gray-400">
        Privat liga — endast inbjudna spelare har åtkomst.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}
