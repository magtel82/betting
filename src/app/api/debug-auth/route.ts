import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ authenticated: false, userError });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, is_active")
    .eq("id", user.id)
    .single();

  return Response.json({
    authenticated: true,
    userId: user.id,
    email: user.email,
    profile,
    profileError,
  });
}
