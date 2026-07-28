import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cached per request: the root layout and every page independently need a
// client, and without this each of those calls would re-read cookies and
// construct a fresh client. React's cache() collapses repeat calls within
// the same render pass into one.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
});

// supabase.auth.getUser() re-validates the session against Supabase's Auth
// server over the network on every call - it is not a local/cached read.
// The root layout and the current page both need the current user on every
// navigation, so without this they'd each pay for that round trip
// separately. Wrapping it in cache() means the second call in the same
// request reuses the first call's result instead of hitting the network
// again.
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
