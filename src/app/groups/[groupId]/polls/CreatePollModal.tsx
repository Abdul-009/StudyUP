"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createPoll } from "./actions";

const MAX_OPTIONS = 6;

export default function CreatePollModal({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);

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
            <form action={createPoll} className="mt-4 space-y-3">
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
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: MAX_OPTIONS }, (_, index) => (
                  <input
                    key={index}
                    name={`option-${index}`}
                    placeholder={`Option ${index + 1}${index < 2 ? " (required)" : " (optional)"}`}
                    required={index < 2}
                    className="w-full rounded-md border border-border px-3 py-2 text-foreground"
                  />
                ))}
              </div>
              <button className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
                Create poll
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
