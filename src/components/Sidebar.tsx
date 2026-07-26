"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import NotificationBadge from "./NotificationBadge";

type SidebarProps = {
  userId: string;
  userName: string;
  userCourse: string | null;
  userYearOfStudy: number | null;
  userProfilePicUrl: string | null;
  unreadCount: number;
  fallbackGroupId: string | null;
};

export default function Sidebar({
  userId,
  userName,
  userCourse,
  userYearOfStudy,
  userProfilePicUrl,
  unreadCount,
  fallbackGroupId,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [menuOpen, setMenuOpen] = useState(false);

  const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const currentGroupId = groupMatch ? groupMatch[1] : fallbackGroupId;
  const groupHref = (segment: string) => (currentGroupId ? `/groups/${currentGroupId}/${segment}` : "/home");

  const navItems = [
    { key: "home", href: "/home", label: "Home", icon: "⌂", isActive: pathname === "/home" },
    { key: "chat", href: groupHref("chat"), label: "Group Chat", icon: "💬", isActive: pathname.includes("/chat") },
    {
      key: "assignments",
      href: groupHref("assignments"),
      label: "Assignments",
      icon: "✓",
      isActive: pathname.includes("/assignments"),
    },
    { key: "polls", href: groupHref("polls"), label: "Polls", icon: "◐", isActive: pathname.includes("/polls") },
    {
      key: "notifications",
      href: "/notifications",
      label: "Notifications",
      icon: "🔔",
      isActive: pathname === "/notifications",
    },
  ];

  const initial = (userName || "?").charAt(0).toUpperCase();
  const subtitle = [userCourse, userYearOfStudy ? `Year ${userYearOfStudy}` : null].filter(Boolean).join(", ");

  async function handleLogout() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-1 border-r border-border bg-paper-alt p-[18px] pt-7">
      <Link href="/home" className="mb-8 px-2.5 font-heading text-xl font-bold text-foreground">
        Study<span className="text-brand">Up</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center gap-3 rounded-[10px] border-l-[3px] border-l-transparent px-3 py-2.5 text-[14.5px] font-medium transition-colors ${
              item.isActive ? "bg-white text-foreground" : "text-muted hover:bg-[#E9E4D6]"
            }`}
            style={item.isActive ? { borderLeftColor: "var(--color-brand)" } : undefined}
          >
            <span className="w-[18px] text-center text-[15px]">{item.icon}</span>
            {item.label}
            {item.key === "notifications" ? (
              <span className="ml-auto">
                <NotificationBadge userId={userId} initialUnreadCount={unreadCount} />
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <div className="relative mt-auto border-t border-border pt-4">
        {menuOpen ? (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-border bg-white p-1.5 shadow-lg">
            <Link
              href="/profile"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-recessed"
            >
              Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-recessed"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-coral hover:bg-surface-recessed"
            >
              Log out
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[#E9E4D6]"
        >
          {userProfilePicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userProfilePicUrl} alt={userName} className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-plum font-heading text-[13px] font-semibold text-white">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-foreground">{userName}</div>
            {subtitle ? <div className="truncate text-xs text-muted">{subtitle}</div> : null}
          </div>
        </button>
      </div>
    </aside>
  );
}
