"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { inboxLinkForEmail, notifyEmailSent } from "@/lib/auth-helpers";

const RESEND_COOLDOWN_SECONDS = 45;

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once the confirmation email is on its way.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function redirectTarget() {
    return `${window.location.origin}/auth/callback?next=/home`;
  }

  function startCooldown() {
    setResendIn(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendIn((value) => {
        if (value <= 1 && timerRef.current) clearInterval(timerRef.current);
        return value - 1;
      });
    }, 1000);
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: redirectTarget(),
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // Email confirmation disabled → we already have a session.
    if (data.session) {
      router.push("/home");
      router.refresh();
      return;
    }

    // Otherwise a confirmation link is on its way.
    setSentTo(email);
    startCooldown();
    notifyEmailSent(email);
    setLoading(false);
  }

  async function handleResend() {
    if (!sentTo || resendIn > 0) return;
    setResendNote(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: redirectTarget() },
    });
    if (resendError) {
      setResendNote(resendError.message);
      return;
    }
    setResendNote("Sent again — check your inbox.");
    startCooldown();
  }

  if (sentTo) {
    const inbox = inboxLinkForEmail(sentTo);
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
        <p className="mb-6 font-heading text-xl font-bold text-foreground">
          Study<span className="text-brand">Up</span>
        </p>
        <div className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-6 text-center sm:p-7">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
            <MailCheck className="h-6 w-6 text-brand" />
          </span>
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">Check your email</h1>
            <p className="mt-1.5 text-sm text-muted">
              We sent a verification link to <span className="font-semibold text-foreground">{sentTo}</span>.
              Open it to activate your account.
            </p>
          </div>

          <a
            href={inbox.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
          >
            {inbox.label}
          </a>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendIn > 0}
            className="w-full rounded-[10px] border border-border px-[18px] py-2.5 text-[13.5px] font-semibold text-foreground hover:bg-surface-recessed disabled:opacity-60"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend email"}
          </button>

          {resendNote ? <p className="text-xs text-muted">{resendNote}</p> : null}

          <p className="text-xs text-muted">
            Can&apos;t find it? Check spam, or{" "}
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setResendNote(null);
              }}
              className="font-semibold text-brand hover:underline"
            >
              use a different email
            </button>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
      <p className="mb-6 font-heading text-xl font-bold text-foreground">
        Study<span className="text-brand">Up</span>
      </p>
      <div className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-6 sm:p-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground">Create account</h1>
          <p className="mt-1 text-sm text-muted">Set up your StudyUp profile.</p>
        </div>

        <GoogleSignInButton next="/home" label="Sign up with Google" />

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <p className="rounded-md bg-coral-tint p-3 text-sm text-coral">{error}</p> : null}

          <label className="block text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>

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
              minLength={6}
              className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-70"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <Link href="/login" className="block text-sm text-muted hover:text-brand">
          Already have an account? Sign in
        </Link>
      </div>
    </main>
  );
}
