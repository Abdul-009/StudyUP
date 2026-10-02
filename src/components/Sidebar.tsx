"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, MessageCircle, Mail, ListChecks, BarChart3, Bell } from "lucide-react";
import NotificationBadge from "./NotificationBadge";
import UserMenu from "./UserMenu";

const LAST_GROUP_KEY = "studyup:lastGroupId";
const MOBILE_LABELS: Record<string, string> = {
  home: "Home",
  chat: "Chat",
  messages: "DMs",
  assignments: "Tasks",
  polls: "Polls",
};
const NO_GROUP_HINT = "Join or create a group first";

type SidebarProps = {
  userId: string;
  userName: string;
  userCourse: string | null;
  userYearOfStudy: number | null;
  userProfilePicUrl: string | null;
  unreadCount: number;
  unreadDmCount: number;
  fallbackGroupId: string | null;
};

export default function Sidebar({
  userId,
  userName,
  userCourse,
  userYearOfStudy,
  userProfilePicUrl,
  unreadCount,
  unreadDmCount,
  fallbackGroupId,
}: SidebarProps) {
  const pathname = usePathname();

  const groupMatch = pathname.match(/^\/groups\/([^/]+)/);
  const routeGroupId = groupMatch ? groupMatch[1] : null;

  // Remember the last group visited so the Chat/Assignments/Polls tabs return
  // there instead of always jumping to the user's oldest group.
  const [lastGroupId, setLastGroupId] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (routeGroupId) {
        window.localStorage.setItem(LAST_GROUP_KEY, routeGroupId);
      } else {
        const stored = window.localStorage.getItem(LAST_GROUP_KEY);
        if (stored) queueMicrotask(() => setLastGroupId(stored));
      }
    } catch {
      // storage unavailable — fall back to the first group
    }
  }, [routeGroupId]);

  const hasGroups = fallbackGroupId !== null;
  const currentGroupId = routeGroupId ?? lastGroupId ?? fallbackGroupId;
  const groupHref = (segment: string) => (currentGroupId ? `/groups/${currentGroupId}/${segment}` : "/home");
  const needsGroup = (key: string) => key === "chat" || key === "assignments" || key === "polls";

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

  // On mobile, notifications lives in the top bar next to the profile — keep it
  // out of the bottom tab bar so that row stays uncrowded.
  const mobileTabItems = navItems.filter((item) => item.key !== "notifications");
  const notificationsActive = pathname === "/notifications";

  return (
    <>
      {/* Desktop sidebar: primary nav only - the user menu now lives in the top-right topbar */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-1 border-r border-border bg-paper-alt p-[18px] pt-7 md:flex">
        <Link href="/home" className="mb-8 block px-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="StudyUp" width={130} height={30} className="h-[30px] w-auto" />
        </Link>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) =>
            !hasGroups && needsGroup(item.key) ? (
              <span
                key={item.key}
                aria-disabled="true"
                title={NO_GROUP_HINT}
                className="flex cursor-not-allowed items-center gap-3 rounded-[10px] border-l-[3px] border-l-transparent px-3 py-2.5 text-[14.5px] font-medium text-muted opacity-45"
              >
                <item.Icon size={18} strokeWidth={2} className="shrink-0" />
                {item.label}
              </span>
            ) : (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 rounded-[10px] border-l-[3px] border-l-transparent px-3 py-2.5 text-[14.5px] font-medium transition-colors ${
                item.isActive ? "bg-white text-foreground" : "text-muted hover:bg-[#E9E4D6]"
              }`}
              style={item.isActive ? { borderLeftColor: "var(--color-brand)" } : undefined}
            >
              <item.Icon size={18} strokeWidth={2} className={`shrink-0 ${item.isActive ? "text-brand" : ""}`} />
              {item.label}
              {item.key === "notifications" ? (
                <span className="ml-auto">
                  <NotificationBadge userId={userId} initialUnreadCount={unreadCount} />
                </span>
              ) : null}
              {item.key === "messages" ? (
                <span className="ml-auto">
                  <NotificationBadge userId={userId} initialUnreadCount={unreadDmCount} scope="dm" />
                </span>
              ) : null}
            </Link>
            ),
          )}
        </nav>
      </aside>

      {/* Mobile top header: logo left, notifications + user menu top-right */}
      <header className="flex items-center justify-between border-b border-border bg-paper-alt px-4 py-3 md:hidden">
        <Link href="/home" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="StudyUp" width={122} height={28} className="h-7 w-auto" />
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className={`relative rounded-full p-2 transition-colors ${
              notificationsActive ? "text-brand" : "text-muted hover:text-foreground"
            }`}
          >
            <Bell size={20} strokeWidth={2} />
            <span className="pointer-events-none absolute -right-0.5 -top-0.5">
              <NotificationBadge userId={userId} initialUnreadCount={unreadCount} />
            </span>
          </Link>

          <UserMenu
            userName={userName}
            userCourse={userCourse}
            userYearOfStudy={userYearOfStudy}
            userProfilePicUrl={userProfilePicUrl}
          />
        </div>
      </header>

      {/* Mobile bottom tab bar: the 5 main nav icons (notifications is in the header) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {mobileTabItems.map((item) =>
          !hasGroups && needsGroup(item.key) ? (
            <span
              key={item.key}
              aria-disabled="true"
              aria-label={`${item.label} — ${NO_GROUP_HINT}`}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-muted opacity-40"
            >
              <item.Icon size={22} strokeWidth={2} />
              <span className="text-[10px] font-medium">{MOBILE_LABELS[item.key]}</span>
            </span>
          ) : (
          <Link
            key={item.key}
            href={item.href}
            aria-label={item.label}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 ${
              item.isActive ? "text-brand" : "text-muted"
            }`}
          >
            <item.Icon size={22} strokeWidth={2} />
            <span className="text-[10px] font-medium">{MOBILE_LABELS[item.key]}</span>
            {item.key === "messages" ? (
              <span className="pointer-events-none absolute right-[calc(50%-24px)] top-1">
                <NotificationBadge userId={userId} initialUnreadCount={unreadDmCount} scope="dm" />
              </span>
            ) : null}
          </Link>
          ),
        )}
      </nav>
    </>
  );
}
