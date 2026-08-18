import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const AUTH_CHECK_TIMEOUT_MS = 5000; // fail fast, well under the 25s edge cap

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
      // Bound every underlying network call this client makes
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS) }),
      },
    },
  );

  try {
    await supabase.auth.getUser();
  } catch (err) {
    // Auth server timed out or errored — don't let the whole site 504
    // because of it. Log it so you can see how often this happens,
    // and let the request continue; your RLS policies and any
    // server-component/route-level checks remain the real security boundary.
    console.error("[middleware] auth check failed:", err);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};