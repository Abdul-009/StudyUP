"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createAssignment } from "./actions";

export default function CreateAssignmentModal({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await createAssignment(formData);
      setOpen(false);
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
        New assignment
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">New assignment</h2>
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
                Title
                <input
                  name="title"
                  required
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              <label className="block text-sm text-muted">
                Description
                <textarea
                  name="description"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              <label className="block text-sm text-muted">
                Due date
                <input
                  type="date"
                  name="dueDate"
                  required
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              {error ? <p className="text-sm text-coral">{error}</p> : null}
              <button
                disabled={pending}
                className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create assignment"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
