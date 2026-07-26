"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordForm() {
  const [supabase] = useState(() => createClient());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      {error ? <p className="rounded-md bg-coral-tint p-3 text-sm text-coral">{error}</p> : null}
      {success ? <p className="rounded-md bg-sage-tint p-3 text-sm text-sage">Password updated.</p> : null}
      <label className="block text-sm text-muted">
        New password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
        />
      </label>
      <label className="block text-sm text-muted">
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          className="mt-1 w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}
