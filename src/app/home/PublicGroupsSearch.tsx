"use client";

import { useState } from "react";
import { joinGroupFromForm, loadMorePublicGroups } from "./actions";

type PublicGroup = { id: string; name: string; description: string | null };

type PublicGroupsSearchProps = {
  search: string;
  initialGroups: PublicGroup[];
  totalCount: number;
};

export default function PublicGroupsSearch({ search, initialGroups, totalCount }: PublicGroupsSearchProps) {
  const [groups, setGroups] = useState<PublicGroup[]>(initialGroups);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleViewMore() {
    setLoading(true);
    setError(null);

    try {
      const nextGroups = await loadMorePublicGroups(search, groups.length);
      setGroups((prev) => [...prev, ...nextGroups]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more groups right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {groups.length ? (
        groups.map((group) => (
          <div key={group.id} className="rounded-lg border border-border bg-surface-recessed p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-medium text-foreground">{group.name}</h4>
                <p className="text-sm text-muted">{group.description || "No description yet."}</p>
              </div>
              <form action={joinGroupFromForm}>
                <input type="hidden" name="groupId" value={group.id} />
                <button className="rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover">
                  Join
                </button>
              </form>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted">No public groups match your search.</p>
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {groups.length < totalCount ? (
        <button
          type="button"
          onClick={handleViewMore}
          disabled={loading}
          className="w-full rounded-md border border-border text-muted hover:bg-surface-recessed py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading..." : "View more"}
        </button>
      ) : null}
    </div>
  );
}
