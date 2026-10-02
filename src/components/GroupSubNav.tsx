"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Megaphone, ListChecks, BarChart3, FolderOpen, Settings } from "lucide-react";

// Every page that belongs to a group, in one place. Announcements and Files
// previously existed but nothing linked to them.
const TABS = [
  { segment: "chat", label: "Chat", Icon: MessageCircle },
  { segment: "announcements", label: "Announcements", Icon: Megaphone },
  { segment: "assignments", label: "Assignments", Icon: ListChecks },
  { segment: "polls", label: "Polls", Icon: BarChart3 },
  { segment: "files", label: "Files", Icon: FolderOpen },
  { segment: "settings", label: "Settings", Icon: Settings },
];

export default function GroupSubNav({ groupId }: { groupId: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Group sections"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-4 md:px-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map(({ segment, label, Icon }) => {
        const href = `/groups/${groupId}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
