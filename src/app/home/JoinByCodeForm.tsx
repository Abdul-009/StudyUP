"use client";

import { useActionState } from "react";
import { joinGroupByCode, type JoinByCodeState } from "./actions";

const initialState: JoinByCodeState = { error: null };

export default function JoinByCodeForm() {
  const [state, formAction, pending] = useActionState(joinGroupByCode, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="inviteCode"
          placeholder="Invite code, e.g. K7Q2XM"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm uppercase tracking-[0.08em] text-foreground"
        />
        <button
          disabled={pending}
          className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Joining…" : "Join group"}
        </button>
      </div>
      {state.error ? <p className="text-sm text-coral">{state.error}</p> : null}
    </form>
  );
}
