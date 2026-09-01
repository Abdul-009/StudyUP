import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth + email-link landing point.
 *
 * - Google sign-in redirects here with `?code=` (PKCE) — we exchange it for a session.
 * - The default "Confirm signup" / "Reset password" emails also land here with `?code=`.
 * - A customised email template can instead send `?token_hash=&type=` — handled too.
 *
 * `next` is where to send the user afterwards; it is clamped to a local path so
 * the callback can't be used as an open redirect.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const emailError = searchParams.get("error_description") || searchParams.get("error");

  const rawNext = searchParams.get("next") || "/home";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/home";

  if (emailError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(emailError)}`);
  }

  const supabase = await createClient();

  let message: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    message = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    message = error?.message ?? null;
  } else {
    message = "This link is missing its verification code. Request a new email and try again.";
  }

  if (message) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
