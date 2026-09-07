// Formats a `lastSeenAt` timestamp for the "Last seen …" line shown when a
// user isn't currently online (live status comes from Realtime Presence
// instead — this is only the offline fallback).
export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Offline";

  const then = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Last seen just now";
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);

  if (dayDiff === 1) return "Last seen yesterday";
  if (dayDiff < 7) return `Last seen ${dayDiff}d ago`;

  return `Last seen ${then.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
