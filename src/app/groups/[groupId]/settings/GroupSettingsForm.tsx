"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateGroupDetails } from "./actions";
import { GROUP_COLOR_PALETTE } from "@/lib/groupColors";

type Props = {
  groupId: string;
  initialName: string;
  initialDescription: string;
  initialAccentColor: string;
  canEdit: boolean;
};

export default function GroupSettingsForm({
  groupId,
  initialName,
  initialDescription,
  initialAccentColor,
  canEdit,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmedName = name.trim();
  const dirty =
    trimmedName !== initialName ||
    description.trim() !== initialDescription ||
    accentColor !== initialAccentColor;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !dirty || saving || !trimmedName) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateGroupDetails(groupId, { name: trimmedName, description, accentColor });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Group name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          disabled={!canEdit || saving}
          maxLength={60}
          required
          className="w-full rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground disabled:opacity-60"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-muted">Description</span>
        <textarea
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSaved(false);
          }}
          disabled={!canEdit || saving}
          maxLength={500}
          rows={3}
          placeholder="What's this group about?"
          className="w-full resize-none rounded-[10px] border border-border bg-surface-recessed px-3 py-2 text-foreground placeholder:text-muted disabled:opacity-60"
        />
      </label>

      <div className="text-sm">
        <span className="mb-1.5 block text-muted">Icon color</span>
        <div className="flex gap-2">
          {GROUP_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                if (!canEdit || saving) return;
                setAccentColor(color);
                setSaved(false);
              }}
              disabled={!canEdit || saving}
              aria-label={`Use ${color} as the group color`}
              aria-pressed={accentColor === color}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 disabled:cursor-not-allowed"
              style={{
                backgroundColor: color,
                borderColor: accentColor === color ? "var(--color-ink)" : "transparent",
              }}
            >
              {accentColor === color ? <Check size={16} className="text-white" strokeWidth={3} /> : null}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-coral">{error}</p> : null}
      {saved ? <p className="text-sm text-sage">Saved.</p> : null}

      {canEdit ? (
        <button
          type="submit"
          disabled={!dirty || saving || !trimmedName}
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
