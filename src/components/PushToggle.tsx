"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { savePushSubscription, deletePushSubscription } from "@/lib/push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// applicationServerKey must be a Uint8Array of the raw VAPID public key.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

type Status = "loading" | "unsupported" | "denied" | "off" | "on" | "working";

export default function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isIOSNotInstalled, setIsIOSNotInstalled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Runs after an await, so no state is set synchronously in the effect body.
    (async () => {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supported || !VAPID_PUBLIC_KEY) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari exposes this non-standard flag
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!cancelled) setIsIOSNotInstalled(isIOS && !standalone);

      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (Notification.permission === "denied") {
          setStatus("denied");
        } else {
          setStatus(existing ? "on" : "off");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not initialise notifications.");
        setStatus("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
      const serialized = JSON.parse(JSON.stringify(subscription)) as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await savePushSubscription(serialized, navigator.userAgent);
      setStatus("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable notifications.");
      setStatus("off");
    }
  }

  async function disable() {
    setError(null);
    setStatus("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn notifications off.");
      setStatus("on");
    }
  }

  if (status === "loading") {
    return <p className="mt-2 text-sm text-muted">Checking notification support…</p>;
  }

  if (status === "unsupported") {
    return (
      <p className="mt-2 text-sm text-muted">
        This browser can&apos;t deliver push notifications{error ? ` (${error})` : ""}.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-muted">
        Get a notification on this device when someone messages you or your group — even when
        Study&nbsp;Up isn&apos;t open.
      </p>

      {status === "denied" ? (
        <p className="text-sm text-coral">
          Notifications are blocked for this site. Re-enable them in your browser&apos;s site
          settings, then reload this page.
        </p>
      ) : status === "on" ? (
        <button
          type="button"
          onClick={disable}
          className="inline-flex items-center gap-2 rounded-[10px] border border-border px-[18px] py-2.5 text-[13.5px] font-semibold text-foreground hover:bg-surface-recessed"
        >
          <BellOff size={16} />
          Turn off notifications on this device
        </button>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === "working"}
          className="inline-flex items-center gap-2 rounded-[10px] bg-brand px-[18px] py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-70"
        >
          <BellRing size={16} />
          {status === "working" ? "Working…" : "Enable notifications on this device"}
        </button>
      )}

      {status === "on" ? (
        <p className="text-xs text-muted">Notifications are on for this device.</p>
      ) : null}

      {isIOSNotInstalled ? (
        <p className="text-xs text-muted">
          On iPhone/iPad, add Study&nbsp;Up to your Home Screen first (Share → Add to Home
          Screen). iOS only delivers push to installed web apps.
        </p>
      ) : null}

      {error ? <p className="text-xs text-coral">{error}</p> : null}
    </div>
  );
}
