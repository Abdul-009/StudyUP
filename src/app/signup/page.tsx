"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-4">
      <p className="mb-6 font-heading text-xl font-bold text-foreground">
        Study<span className="text-brand">Up</span>
      </p>
      <form onSubmit={handleSubmit} className="w-full space-y-4 rounded-[20px] border border-border bg-surface p-7">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-foreground">Create account</h1>
          <p className="mt-1 text-sm text-muted">Set up your StudyUp profile.</p>
        </div>

        {error ? <p className="rounded-md bg-coral-tint p-3 text-sm text-coral">{error}</p> : null}

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground" />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground" />
        </label>

        <button type="submit" disabled={loading} className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
          {loading ? "Creating account..." : "Create account"}
        </button>

        <Link href="/login" className="block text-sm text-muted hover:text-brand">Already have an account? Sign in</Link>
      </form>
    </main>
  );
}
