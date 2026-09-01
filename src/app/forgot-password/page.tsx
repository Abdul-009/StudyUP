"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Route through the callback so the recovery code becomes a session, then
      // land on Settings where the "Change password" form lives.
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage("Check your email for a password reset link.");
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
      <p className="mb-6 font-heading text-xl font-bold text-foreground">
        Study<span className="text-brand">Up</span>
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-6 sm:p-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground">Reset password</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll send a reset link to your inbox.</p>
        </div>

        {error ? <p className="rounded-md bg-coral-tint p-3 text-sm text-coral">{error}</p> : null}
        {message ? <p className="rounded-md bg-sage-tint p-3 text-sm text-sage">{message}</p> : null}

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground" />
        </label>

        <button type="submit" disabled={loading} className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <Link href="/login" className="block text-sm text-muted hover:text-brand">Back to login</Link>
      </form>
    </main>
  );
}
