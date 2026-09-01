"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  // Surface any ?error= handed back by /auth/callback (bad/expired link, etc.).
  useEffect(() => {
    const callbackError = new URLSearchParams(window.location.search).get("error");
    if (!callbackError) return;
    // Deferred so it isn't a synchronous setState in the effect body.
    queueMicrotask(() => setError(callbackError));
    window.history.replaceState(null, "", "/login");
  }, []);

  const needsConfirmation = (error ?? "").toLowerCase().includes("not confirmed");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResendNote(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  async function handleResendConfirmation() {
    if (!email) {
      setResendNote("Enter your email above first.");
      return;
    }
    setResendNote(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/home` },
    });
    setResendNote(
      resendError ? resendError.message : "Verification email sent — check your inbox.",
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
      <p className="mb-6 font-heading text-xl font-bold text-foreground">
        Study<span className="text-brand">Up</span>
      </p>
      <div className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-6 sm:p-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back to StudyUp.</p>
        </div>

        <GoogleSignInButton next="/home" label="Continue with Google" />

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-md bg-coral-tint p-3 text-sm text-coral">
              <p>{error}</p>
              {needsConfirmation ? (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  className="mt-1.5 font-semibold underline"
                >
                  Resend verification email
                </button>
              ) : null}
            </div>
          ) : null}

          {resendNote ? <p className="rounded-md bg-sage-tint p-3 text-sm text-sage">{resendNote}</p> : null}

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm text-muted">
          <Link href="/signup" className="hover:text-brand">
            Create account
          </Link>
          <Link href="/forgot-password" className="hover:text-brand">
            Forgot password?
          </Link>
        </div>
      </div>
    </main>
  );
}
