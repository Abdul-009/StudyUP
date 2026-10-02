"use client";

import { useActionState } from "react";
import { updateNotificationPreferences, type PreferencesState } from "./actions";
import SubmitButton from "@/components/SubmitButton";

type Option = { type: string; label: string; enabled: boolean };

const initialState: PreferencesState = { saved: false, error: null };

export default function NotificationPreferencesForm({ options }: { options: Option[] }) {
  const [state, formAction] = useActionState(updateNotificationPreferences, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {options.map((option) => (
        <label
          key={option.type}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-recessed p-3 text-sm text-foreground"
        >
          {option.label}
          <input type="checkbox" name={option.type} defaultChecked={option.enabled} className="h-4 w-4" />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          Save preferences
        </SubmitButton>
        {state.saved ? (
          <span role="status" className="text-sm font-medium text-brand">
            Saved
          </span>
        ) : null}
        {state.error ? <span className="text-sm text-coral">{state.error}</span> : null}
      </div>
    </form>
  );
}
