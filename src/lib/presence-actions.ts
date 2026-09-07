"use server";

import { createClient } from "@/lib/supabase/server";

// Best-effort heartbeat — called periodically while a user is connected and
// on best-effort disconnect hooks (beforeunload/visibilitychange/unmount).
// Never throws: a missed write just means `lastSeenAt` is briefly stale,
// which the "last seen" UI already tolerates.
export async function touchLastSeen() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;
    await supabase.from("User").update({ lastSeenAt: new Date().toISOString() }).eq("id", user.id);
  } catch {
    // best-effort — swallow network/auth errors
  }
}
