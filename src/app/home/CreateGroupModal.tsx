"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { createGroup } from "./actions";

type CreateGroupModalProps = {
  variant: "button" | "card";
  atLimit?: boolean;
  limit?: number;
};

export default function CreateGroupModal({ variant, atLimit = false, limit = 4 }: CreateGroupModalProps) {
  const [open, setOpen] = useState(false);

  if (atLimit) {
    return variant === "button" ? (
      <button
        type="button"
        disabled
        title={`You can create up to ${limit} groups`}
        className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-[10px] bg-brand/40 px-[18px] py-2.5 text-[13.5px] font-semibold text-white"
      >
        <Plus size={16} />
        New group
      </button>
    ) : (
      <div className="flex min-h-[118px] w-full flex-col items-center justify-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-border px-4 text-center text-[13px] font-medium text-muted">
        <span className="font-semibold">Group limit reached</span>
        <span>You can create up to {limit} groups.</span>
      </div>
    );
  }

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          <Plus size={16} />
          New group
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[118px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-border text-[14px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Plus size={22} />
          <span>Create a new group</span>
        </button>
      )}

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
              <h2 className="text-lg font-semibold text-foreground">Create a group</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <form action={createGroup} className="mt-4 space-y-3">
              <label className="block text-sm text-muted">
                Name
                <input
                  name="name"
                  required
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              <label className="block text-sm text-muted">
                Description
                <input
                  name="description"
                  className="mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" name="isPrivate" className="h-4 w-4" />
                Private group
              </label>
              <button className="w-full rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
                Create group
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
