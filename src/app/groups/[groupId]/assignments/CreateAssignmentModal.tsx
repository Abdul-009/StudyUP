"use client";

import { useState } from "react";
import { createAssignment } from "./actions";

export default function CreateAssignmentModal({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
      >
        + New assignment
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
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
                ✕
              </button>
            </div>
            <form action={createAssignment} className="mt-4 space-y-3">
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
              <button className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
                Create assignment
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
