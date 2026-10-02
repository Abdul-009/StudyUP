"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PresenceContext = createContext<Set<string>>(new Set());

// Whether a given userId is currently present on the global online-users
// presence channel. Live/ephemeral — never touches Postgres.
export function useIsOnline(userId: string | null | undefined) {
  const onlineUserIds = useContext(PresenceContext);
  return !!userId && onlineUserIds.has(userId);
}

const HEARTBEAT_MS = 60_000;
const MIN_TOUCH_GAP_MS = 15_000;

// Mounted once at the root layout for every signed-in user. Tracks presence
// on a single global channel (keyed by userId) so any chat screen can check
// who's online without each opening its own presence subscription, and
// maintains `User.lastSeenAt` as a fallback for when a user isn't online —
// refreshed periodically while connected (and best-effort on disconnect)
// since an explicit presence "leave" can be missed entirely if the app is
// killed rather than closed cleanly.
export default function PresenceProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("online-users", {
      config: { presence: { key: userId } },
    });

    // Guards the async subscribe callback below: React (StrictMode's dev
    // double-invoke, or a fast userId change) can run this effect's cleanup
    // — which removes the channel — before the "SUBSCRIBED" status for THIS
    // channel ever arrives, since that round-trip is async. Without this
    // flag, a late callback would call `.track()` on an already-removed
    // channel, registering a presence entry nothing will ever clean up —
    // exactly the "stale online user" symptom this feature must avoid.
    let cancelled = false;

    channel.on("presence", { event: "sync" }, () => {
      setOnlineUserIds(new Set(Object.keys(channel.presenceState())));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && !cancelled) {
        await channel.track({ onlineAt: new Date().toISOString() });
      }
    });

    // A direct client write rather than a server action: Next runs server
    // actions one at a time per client, so a heartbeat would queue ahead of
    // (and delay) the user's own message sends.
    let lastTouch = 0;
    function touchLastSeen() {
      const now = Date.now();
      if (now - lastTouch < MIN_TOUCH_GAP_MS) return;
      lastTouch = now;
      void supabase
        .from("User")
        .update({ lastSeenAt: new Date(now).toISOString() })
        .eq("id", userId)
        .then(
          () => {},
          () => {},
        );
    }

    touchLastSeen();
    const heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") touchLastSeen();
    }, HEARTBEAT_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        touchLastSeen();
      }
    }
    // beforeunload must not gate on visibilityState — it isn't reliably
    // "hidden" yet when beforeunload fires, so reusing that handler here
    // silently skipped the tab-close write it was meant to guarantee.
    function handleBeforeUnload() {
      touchLastSeen();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      touchLastSeen();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return <PresenceContext.Provider value={onlineUserIds}>{children}</PresenceContext.Provider>;
}
