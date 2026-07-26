import Link from "next/link";
import { tintColor } from "@/lib/groupColors";

type SidebarGroup = {
  id: string;
  name: string;
  accentColor: string;
  lastMessage: { content: string; createdAt: string } | null;
};

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatSidebar({ groups, activeGroupId }: { groups: SidebarGroup[]; activeGroupId: string }) {
  return (
    <aside className="w-[268px] shrink-0 overflow-y-auto rounded-xl border border-border bg-surface py-1">
      <h2 className="px-4 pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
        All groups
      </h2>
      <div className="space-y-0.5">
        {groups.map((group) => {
          const isActive = group.id === activeGroupId;
          return (
            <Link
              key={group.id}
              href={`/groups/${group.id}/chat`}
              className={`flex items-center gap-2.5 border-l-[3px] px-4 py-2.5 transition-colors ${
                isActive ? "" : "border-transparent hover:bg-surface-recessed"
              }`}
              style={isActive ? { backgroundColor: tintColor(group.accentColor), borderLeftColor: group.accentColor } : undefined}
            >
              <span
                className="h-[9px] w-[9px] shrink-0 rounded-full"
                style={{ backgroundColor: group.accentColor }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-foreground">{group.name}</div>
                <div className="truncate text-xs text-muted">
                  {group.lastMessage ? group.lastMessage.content : "No messages yet"}
                </div>
              </div>
              {group.lastMessage ? (
                <span className="shrink-0 font-mono text-[10.5px] text-muted">
                  {formatTimestamp(group.lastMessage.createdAt)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
