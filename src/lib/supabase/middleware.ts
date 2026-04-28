import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated → /login
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // For authenticated users: check profile status first
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .single();

    const isActive = profile?.is_active ?? false;

    // Inactive user: stay on /login with error, never redirect to /
    if (!isActive) {
      if (!pathname.startsWith("/login")) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "not_invited");
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // Active user on /login → /
    if (pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
