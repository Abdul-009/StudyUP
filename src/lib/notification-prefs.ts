import type { SupabaseClient } from "@supabase/supabase-js";

// Settings → Notification preferences were saved but never consulted, so every
// toggle was a no-op. Preferences default to ON; only explicit opt-outs are stored.
export async function withoutOptedOut(
  supabase: SupabaseClient,
  userIds: string[],
  type: "NEW_MESSAGE" | "NEW_ASSIGNMENT" | "POLL_UPDATE" | "ANNOUNCEMENT",
): Promise<string[]> {
  if (!userIds.length) return userIds;

  const { data } = await supabase
    .from("NotificationPreference")
    .select("userId")
    .eq("type", type)
    .eq("enabled", false)
    .in("userId", userIds);

  const optedOut = new Set((data ?? []).map((row) => row.userId as string));
  return userIds.filter((id) => !optedOut.has(id));
}
