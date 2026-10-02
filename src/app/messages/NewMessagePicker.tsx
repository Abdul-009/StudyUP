"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";

export type Person = {
  id: string;
  name: string;
  profilePicUrl: string | null;
  groups: string[];
};

// Starting a conversation used to mean digging through a group's member list.
// This lists everyone you share a group with, searchable, and opens the thread.
export default function NewMessagePicker({ people, variant = "button" }: { people: Person[]; variant?: "button" | "link" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? people.filter((p) => p.name.toLowerCase().includes(q) || p.groups.some((g) => g.toLowerCase().includes(q)))
    : people;

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          <Plus size={16} />
          New message
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-block rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover"
        >
          Start a conversation
        </button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0 sm:items-center sm:px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="New message"
            className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-xl bg-surface p-5 shadow-xl sm:rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">New message</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-recessed px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people or groups"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {filtered.length ? (
                filtered.map((person) => (
                  <Link
                    key={person.id}
                    href={`/messages?start=${person.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-recessed"
                  >
                    {person.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={person.profilePicUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-plum font-heading text-sm font-semibold text-white">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
                      <p className="truncate text-xs text-muted">{person.groups.join(", ")}</p>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="px-2 py-6 text-center text-sm text-muted">
                  {people.length ? "No one matches that search." : "Join a group to message people in it."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
