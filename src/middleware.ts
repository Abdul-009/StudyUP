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
    const { data: { user } } = await supabase.auth.getUser();
    const { pathname } = request.nextUrl;

    const isGuestOnly = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";
    const isPublic =
      pathname === "/" ||
      isGuestOnly ||
      pathname === "/reset-password" ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/api/");

    // Gate here instead of letting each page render a full shell and then
    // redirect: signed-out users go to login, signed-in users skip the auth pages.
    const redirectTo = (path: string, next?: string) => {
      const url = request.nextUrl.clone();
      url.pathname = path;
      url.search = next ? `?next=${encodeURIComponent(next)}` : "";
      const redirectResponse = NextResponse.redirect(url);
      // Keep any session cookies refreshed by getUser() above.
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    };

    if (!user && !isPublic) return redirectTo("/login", pathname + request.nextUrl.search);
    if (user && isGuestOnly) return redirectTo("/home");
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
  // Skip static/asset routes AND the service worker + web manifest — those must
  // be served as plain files with no auth round-trip or Set-Cookie, or Chrome's
  // SW update check can stall on a slow connection and fail scoped navigations.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};