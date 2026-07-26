"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationBadgeProps = {
  userId: string;
  initialUnreadCount: number;
};

export default function NotificationBadge({ userId, initialUnreadCount }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    async function refreshUnreadCount() {
      const { count } = await supabase
        .from("Notification")
        .select("id", { count: "exact", head: true })
        .eq("userId", userId)
        .eq("isRead", false);
      setUnreadCount(count ?? 0);
    }

    const channel = supabase.channel(`notifications-${userId}`);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
      () => {
        refreshUnreadCount();
      },
    );

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "Notification", filter: `userId=eq.${userId}` },
      () => {
        refreshUnreadCount();
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  if (!unreadCount) {
    return null;
  }

  return (
    <span className="inline-flex items-center justify-center rounded-full bg-coral px-[7px] py-px text-[11px] font-semibold text-white">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
