import { createClient } from "@supabase/supabase-js";

// Decode the role claim from a JWT without any external library.
function jwtRole(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

// Service role client — bypasses RLS.
// MUST only be used server-side (Server Actions, Route Handlers).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cron/admin endpoints cannot bypass RLS without it");

  const role = jwtRole(key);
  if (role !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY has JWT role="${role ?? "unknown"}" — expected "service_role". ` +
      `The wrong key was probably pasted (anon key instead of service_role key).`
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Exported so the diagnose endpoint can surface key info without running syncOdds.
export function inspectAdminKey(): { present: boolean; prefix: string; role: string | null } {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return {
    present: key.length > 0,
    prefix:  key.substring(0, 30) + (key.length > 30 ? "…" : ""),
    role:    key ? jwtRole(key) : null,
  };
}
