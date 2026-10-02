"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createPoll } from "./actions";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export default function CreatePollModal({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable ids so removing a middle option keeps the other inputs' typed text.
  const [optionIds, setOptionIds] = useState<number[]>([0, 1]);
  const [nextOptionId, setNextOptionId] = useState(2);

  function addOption() {
    if (optionIds.length >= MAX_OPTIONS) return;
    setOptionIds((ids) => [...ids, nextOptionId]);
    setNextOptionId((n) => n + 1);
  }

  function removeOption(id: number) {
    setOptionIds((ids) => (ids.length > MIN_OPTIONS ? ids.filter((x) => x !== id) : ids));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await createPoll(formData);
      setOpen(false);
      setOptionIds([0, 1]);
      setNextOptionId(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
      >
        <Plus size={16} />
        New poll
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">New poll</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input type="hidden" name="groupId" value={groupId} />
              <label className="block text-sm text-muted">
                Question
                <input
                  name="question"
                  required
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-muted">
                  Type
                  <select
                    name="type"
                    required
                    defaultValue="MEETING_TIME"
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                  >
                    <option value="MEETING_TIME">Meeting time</option>
                    <option value="STUDY_TOPIC">Study topic</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </label>
                <label className="block text-sm text-muted">
                  Closes at (optional)
                  <input
                    type="date"
                    name="closesAt"
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="allowMultiple" className="h-4 w-4" />
                Allow selecting multiple options
              </label>
              <div className="space-y-2">
                <p className="text-sm text-muted">Options</p>
                {optionIds.map((id, index) => (
                  <div key={id} className="flex items-center gap-2">
                    <input
                      name={`option-${index}`}
                      placeholder={`Option ${index + 1}`}
                      required
                      maxLength={100}
                      className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-foreground"
                    />
                    {optionIds.length > MIN_OPTIONS ? (
                      <button
                        type="button"
                        onClick={() => removeOption(id)}
                        aria-label={`Remove option ${index + 1}`}
                        className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface-recessed hover:text-coral"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                ))}
                {optionIds.length < MAX_OPTIONS ? (
                  <button
                    type="button"
                    onClick={addOption}
                    className="flex items-center gap-1.5 rounded-[10px] border border-dashed border-border px-3.5 py-2 text-[13px] font-semibold text-muted hover:border-brand hover:text-brand"
                  >
                    <Plus size={14} />
                    Add option
                  </button>
                ) : (
                  <p className="text-xs text-muted">Maximum of {MAX_OPTIONS} options.</p>
                )}
              </div>
              {error ? <p className="text-sm text-coral">{error}</p> : null}
              <button
                disabled={pending}
                className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create poll"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
