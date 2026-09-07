"use client";

import { useState } from "react";
import { UserX, LogOut } from "lucide-react";
import { leaveGroup, removeMember } from "./actions";

type MemberRecord = {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER";
  user: { name: string; email: string; profilePicUrl: string | null } | null;
};

type Props = {
  groupId: string;
  currentUserId: string;
  isAdmin: boolean;
  initialMembers: MemberRecord[];
};

export default function GroupMembersSection({ groupId, currentUserId, isAdmin, initialMembers }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function handleRemove(member: MemberRecord) {
    const name = member.user?.name || "this member";
    if (!window.confirm(`Remove ${name} from the group? They'll lose access immediately.`)) {
      return;
    }
    setPendingId(member.id);
    setError(null);
    const previous = members;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      await removeMember(groupId, member.userId);
    } catch (err) {
      setMembers(previous);
      setError(err instanceof Error ? err.message : "Couldn't remove that member.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleLeave() {
    if (
      !window.confirm(
        "Leave this group? You'll lose access to its chat, files, and assignments.",
      )
    ) {
      return;
    }
    setLeaving(true);
    setError(null);
    try {
      await leaveGroup(groupId); // redirects to /home on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave the group.");
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          return (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface-recessed p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                  {member.user?.name || "Unknown"}
                  {isSelf ? <span className="text-xs font-normal text-muted">(you)</span> : null}
                </p>
                <p className="truncate text-xs text-muted">
                  {member.role === "ADMIN" ? "Admin" : "Member"} · {member.user?.email}
                </p>
              </div>
              {isAdmin && !isSelf ? (
                <button
                  type="button"
                  onClick={() => handleRemove(member)}
                  disabled={pendingId === member.id}
                  aria-label={`Remove ${member.user?.name || "member"}`}
                  title="Remove from group"
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-border hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UserX size={18} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-coral">{error}</p> : null}

      <button
        type="button"
        onClick={handleLeave}
        disabled={leaving}
        className="flex items-center gap-1.5 rounded-[10px] border border-border px-[18px] py-2.5 text-[13.5px] font-semibold text-coral hover:bg-coral-tint disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut size={16} />
        {leaving ? "Leaving…" : "Leave group"}
      </button>
    </div>
  );
}
