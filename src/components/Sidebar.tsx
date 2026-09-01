"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, Mail, ListChecks, BarChart3, Bell } from "lucide-react";
import NotificationBadge from "./NotificationBadge";
import UserMenu from "./UserMenu";

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

  const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const currentGroupId = groupMatch ? groupMatch[1] : fallbackGroupId;
  const groupHref = (segment: string) => (currentGroupId ? `/groups/${currentGroupId}/${segment}` : "/home");

  const navItems = [
    { key: "home", href: "/home", label: "Home", Icon: Home, isActive: pathname === "/home" },
    { key: "chat", href: groupHref("chat"), label: "Group Chat", Icon: MessageCircle, isActive: pathname.includes("/chat") },
    { key: "messages", href: "/messages", label: "Messages", Icon: Mail, isActive: pathname.includes("/messages") },
    {
      key: "assignments",
      href: groupHref("assignments"),
      label: "Assignments",
      Icon: ListChecks,
      isActive: pathname.includes("/assignments"),
    },
    { key: "polls", href: groupHref("polls"), label: "Polls", Icon: BarChart3, isActive: pathname.includes("/polls") },
    {
      key: "notifications",
      href: "/notifications",
      label: "Notifications",
      Icon: Bell,
      isActive: pathname === "/notifications",
    },
  ];

  return (
    <>
      {/* Desktop sidebar: primary nav only - the user menu now lives in the top-right topbar */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 border-r border-border bg-paper-alt p-[18px] pt-7 md:flex">
        <Link href="/home" className="mb-8 block px-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="StudyUp" width={130} height={30} className="h-[30px] w-auto" />
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
              <item.Icon size={18} strokeWidth={2} className="shrink-0" />
              {item.label}
              {item.key === "notifications" ? (
                <span className="ml-auto">
                  <NotificationBadge userId={userId} initialUnreadCount={unreadCount} />
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile top header: logo left, user menu top-right */}
      <header className="flex items-center justify-between border-b border-border bg-paper-alt px-4 py-3 md:hidden">
        <Link href="/home" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="StudyUp" width={122} height={28} className="h-7 w-auto" />
        </Link>

        <UserMenu
          userName={userName}
          userCourse={userCourse}
          userYearOfStudy={userYearOfStudy}
          userProfilePicUrl={userProfilePicUrl}
        />
      </header>

      {/* Mobile bottom tab bar: the 5 main nav icons only */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 ${
              item.isActive ? "text-brand" : "text-muted"
            }`}
          >
            <item.Icon size={22} strokeWidth={2} />
            {item.key === "notifications" && unreadCount > 0 ? (
              <span className="absolute right-[27%] top-1.5 h-2 w-2 rounded-full bg-coral" />
            ) : null}
          </Link>
        ))}
      </nav>
    </>
  );
}
