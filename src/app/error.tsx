"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        That didn&apos;t work. Try again, and if it keeps happening head back to your groups.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="rounded-[10px] border border-border px-[18px] py-2.5 text-[13.5px] font-semibold text-foreground hover:bg-surface-recessed"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
