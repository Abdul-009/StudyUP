"use server";

import { createClient } from "@/lib/supabase/server";

type SerializedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Store (or refresh) the current browser's push subscription for this user.
 * Called from PushToggle after `pushManager.subscribe()`.
 */
export async function savePushSubscription(sub: SerializedSubscription, userAgent?: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in to enable notifications.");
  }

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("That push subscription looks invalid.");
  }

  const { error } = await supabase.from("PushSubscription").upsert(
    {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}

/** Remove one browser's subscription (called on "turn off" / unsubscribe). */
export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("You must be signed in.");
  }

  const { error } = await supabase
    .from("PushSubscription")
    .delete()
    .eq("endpoint", endpoint)
    .eq("userId", user.id);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}
