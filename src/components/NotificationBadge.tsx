"use client";

import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationBadgeProps = {
  userId: string;
  initialUnreadCount: number;
  /** "all" = every unread notification; "dm" = only unread direct messages. */
  scope?: "all" | "dm";
};

export default function NotificationBadge({ userId, initialUnreadCount, scope = "all" }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  // This badge is rendered several times (desktop sidebar, mobile header, tab bar).
  // Two realtime channels with the same name make supabase-js hand the second
  // instance the first one's already-subscribed channel, and its `.on()` call then
  // throws ("cannot add postgres_changes callbacks after subscribe()"), which takes
  // down the whole page. A per-instance channel name keeps them separate.
  const channelId = useId().replace(/[^a-z0-9]/gi, "");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshUnreadCount() {
      let query = supabase
        .from("Notification")
        .select("id", { count: "exact", head: true })
        .eq("userId", userId)
        .eq("isRead", false);
      if (scope === "dm") {
        query = query.eq("type", "NEW_MESSAGE").is("groupId", null);
      }
      const { count } = await query;
      if (!cancelled) setUnreadCount(count ?? 0);
    }

    // "Clear all" / "Mark all read" touch many rows at once; collapse the burst
    // of realtime events into a single recount.
    function scheduleRefresh() {
      clearTimeout(timer);
      timer = setTimeout(refreshUnreadCount, 250);
    }

    const filter = `userId=eq.${userId}`;
    const channel = supabase
      .channel(`notif-${scope}-${userId}-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "Notification", filter }, scheduleRefresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "Notification", filter }, scheduleRefresh)
      // Deleting notifications ("Clear all") previously never updated the badge.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "Notification", filter }, scheduleRefresh);

    channel.subscribe();

    // The socket can be suspended while the tab is in the background, so recount
    // on return instead of trusting that no event was missed.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") scheduleRefresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, channelId, scope]);

  // Opening a chat or the notifications page changes what is unread without
  // necessarily producing an event for this client, so recount on navigation too.
  useEffect(() => {
    let cancelled = false;
    async function recount() {
      let query = supabase
        .from("Notification")
        .select("id", { count: "exact", head: true })
        .eq("userId", userId)
        .eq("isRead", false);
      if (scope === "dm") {
        query = query.eq("type", "NEW_MESSAGE").is("groupId", null);
      }
      const { count } = await query;
      if (!cancelled) setUnreadCount(count ?? 0);
    }
    const t = setTimeout(recount, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pathname, supabase, userId, scope]);

  if (!unreadCount) {
    return null;
  }

  return (
    <span className="inline-flex items-center justify-center rounded-full bg-coral px-[7px] py-px text-[11px] font-semibold text-white">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
