"use client";

import { useFormStatus } from "react-dom";

// Submit button for forms driven by server actions: disables itself and swaps
// its label while the action runs (those forms otherwise give no feedback), and
// can ask for confirmation before a destructive submit.
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  confirmMessage,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
