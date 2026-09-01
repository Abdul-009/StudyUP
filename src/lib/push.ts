import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

// NOTE: server-only module. It is imported exclusively from "use server" action
// files; it must never be pulled into a client component (it touches Node
// crypto via `web-push`).

// `web-push` is a runtime-only dependency (it pulls in Node crypto internals we
// don't want in any client bundle). It is loaded through createRequire so a
// missing install degrades to "no push" instead of breaking the build — run
// `npm install` after pulling this branch to actually enable it.
type WebPushLike = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string,
  ): Promise<unknown>;
};

const nodeRequire = createRequire(import.meta.url);

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

let webpush: WebPushLike | null = null;
let initialised = false;

function getWebPush(): WebPushLike | null {
  if (initialised) return webpush;
  initialised = true;

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID keys missing — skipping web push.");
    return null;
  }

  try {
    webpush = nodeRequire("web-push") as WebPushLike;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch {
    console.warn("[push] 'web-push' is not installed — run `npm install`. Skipping web push.");
    webpush = null;
  }
  return webpush;
}

// Service-role client: the push sender needs to read every recipient's
// subscription rows, which RLS would otherwise hide.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Fire-and-forget a web push to every device the given users have registered.
 * Never throws — a failed push must not break sending a message. Dead
 * subscriptions (404/410 from the push service) are pruned as we go.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const recipients = Array.from(new Set(userIds)).filter(Boolean);
  const client = getWebPush();
  if (!recipients.length || !client) return;

  try {
    const supabase = adminClient();
    const { data: subs, error } = await supabase
      .from("PushSubscription")
      .select("id, endpoint, p256dh, auth")
      .in("userId", recipients);

    if (error || !subs?.length) return;

    const body = JSON.stringify(payload);
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await client.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleIds.push(sub.id);
          } else {
            console.error("[push] send failed", statusCode, err);
          }
        }
      }),
    );

    if (staleIds.length) {
      await supabase.from("PushSubscription").delete().in("id", staleIds);
    }
  } catch (err) {
    console.error("[push] unexpected failure", err);
  }
}
