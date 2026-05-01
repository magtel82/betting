import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;

  // Redirect active logged-in users away from login page.
  // Skip check when an error is present to avoid loop for inactive users.
  if (!error) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .single();
      if (profile?.is_active) redirect("/");
    }
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(26, 86, 219, 0.10), transparent 55%), radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.08), transparent 55%), #f8fafc",
      }}
    >
      <LoginForm errorParam={error} />
    </div>
  );
}
