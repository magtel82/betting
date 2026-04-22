import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS.
// MUST only be used server-side (Server Actions, Route Handlers).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
