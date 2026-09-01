"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationBadgeProps = {
  userId: string;
  initialUnreadCount: number;
};

export default function NotificationBadge({ userId, initialUnreadCount }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [supabase] = useState(() => createClient());

  // This badge is rendered twice (desktop sidebar + mobile header). Two realtime
  // channels with the same name make supabase-js hand the second instance the
  // first one's already-subscribed channel, and its `.on()` call then throws
  // ("cannot add postgres_changes callbacks after subscribe()"), which takes
  // down the whole page. A per-instance channel name keeps them separate.
  const channelId = useId().replace(/[^a-z0-9]/gi, "");

  useEffect(() => {
    let cancelled = false;

    async function refreshUnreadCount() {
      const { count } = await supabase
        .from("Notification")
        .select("id", { count: "exact", head: true })
        .eq("userId", userId)
        .eq("isRead", false);
      if (!cancelled) setUnreadCount(count ?? 0);
    }

    const channel = supabase
      .channel(`notif-${userId}-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
        refreshUnreadCount,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
        refreshUnreadCount,
      );

    channel.subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, channelId]);

  if (!unreadCount) {
    return null;
  }

  return (
    <span className="inline-flex items-center justify-center rounded-full bg-coral px-[7px] py-px text-[11px] font-semibold text-white">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
