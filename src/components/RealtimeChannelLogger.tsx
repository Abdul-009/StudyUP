"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Dev-only visibility into Realtime channel lifecycle. `createClient()` is a
// cached singleton (see src/lib/supabase/client.ts), so `getChannels()` here
// reflects every channel open anywhere in the app — chat, DMs, polls,
// notifications, typing broadcasts, presence — not just this component's own.
//
// Logs on every route change so a leak (a channel that should have been torn
// down on navigation but wasn't) shows up as a climbing count in the console
// instead of staying silent until something breaks.
export default function RealtimeChannelLogger() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    // Runs after this render's effects, by which point the page that just
    // unmounted has torn down its channel and the page that just mounted has
    // opened its own — so the count reflects the new steady state, not a
    // mid-transition snapshot.
    const id = setTimeout(() => {
      const supabase = createClient();
      const channels = supabase.getChannels();
      console.log(
        `[realtime] ${channels.length} active channel(s) after navigating to ${pathname}:`,
        channels.map((c) => c.topic),
      );
    }, 0);

    return () => clearTimeout(id);
  }, [pathname]);

  return null;
}
