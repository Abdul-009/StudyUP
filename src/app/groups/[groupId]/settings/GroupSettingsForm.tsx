"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameGroup } from "./actions";

type Props = {
  groupId: string;
  initialName: string;
  canEdit: boolean;
};

export default function GroupSettingsForm({ groupId, initialName, canEdit }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const trimmed = name.trim();
  const dirty = trimmed !== initialName && trimmed.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !dirty || saving) return;

    setSaving(true);
    setError(null);
    setSavedName(null);
    try {
      const result = await renameGroup(groupId, trimmed);
      setSavedName(result.name);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename the group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Group name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSavedName(null);
          }}
          disabled={!canEdit || saving}
          maxLength={60}
          required
          className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground disabled:opacity-60"
        />
      </label>

      {error ? <p className="text-sm text-coral">{error}</p> : null}
      {savedName ? <p className="text-sm text-sage">Saved — group is now &ldquo;{savedName}&rdquo;.</p> : null}

      {canEdit ? (
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      ) : (
        <p className="text-sm text-muted">Only group admins can change these settings.</p>
      )}
    </form>
  );
}
