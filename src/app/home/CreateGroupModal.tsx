"use client";

import { useState } from "react";
import { createGroup } from "./actions";

type CreateGroupModalProps = {
  variant: "button" | "card";
};

export default function CreateGroupModal({ variant }: CreateGroupModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          + New group
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[118px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-border text-[14px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <span className="text-2xl leading-none">+</span>
          <span>Create a new group</span>
        </button>
      )}

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
              <h2 className="text-lg font-semibold text-foreground">Create a group</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground"
              >
                ✕
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
