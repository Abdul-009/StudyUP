"use client";

import { useEffect } from "react";

/**
 * Registers the push service worker for every signed-in page load, so that a
 * previously-granted subscription keeps delivering `notificationclick` routing
 * even if the user never re-opens Settings. Subscribing/unsubscribing itself
 * lives in <PushToggle />.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("[sw] registration failed", err));
  }, []);

  return null;
}
