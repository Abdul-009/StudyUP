"use client";

import { useIsOnline } from "@/components/PresenceProvider";
import { formatLastSeen } from "@/lib/format-last-seen";

export function OnlineDot({ userId }: { userId: string }) {
  const isOnline = useIsOnline(userId);
  if (!isOnline) return null;
  return <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-sage" />;
}

export default function PresenceStatus({
  userId,
  lastSeenAt,
  className,
}: {
  userId: string;
  lastSeenAt: string | null;
  className?: string;
}) {
  const isOnline = useIsOnline(userId);
  return <span className={className}>{isOnline ? "Online" : formatLastSeen(lastSeenAt)}</span>;
}
