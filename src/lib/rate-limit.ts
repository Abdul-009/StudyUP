// Basic per-user anti-spam rate limiting for message sends (group chat and
// DMs share one budget, so splitting traffic across both surfaces can't
// double the effective rate).
//
// Postgres-backed starting point: no Redis/Upstash in the stack yet, and a
// per-process in-memory counter would be unreliable across a multi-instance
// serverless deployment anyway (each invocation can land on a different
// instance with its own memory). This does two cheap `count`-only reads per
// send, which is fine at this app's scale. If load grows, move this to a
// proper rate-limiter (e.g. Upstash Redis, sliding-window or token-bucket)
// instead of hitting Postgres on every send.
//
// Plain TS, no "use server" - only ever imported by other server-only code
// (the send actions), never called directly from a Client Component.

import type { createClient } from "@/lib/supabase/server";

const WINDOW_SECONDS = 10;
const MAX_MESSAGES_PER_WINDOW = 10;

export const RATE_LIMIT_MESSAGE = "You're sending messages too quickly — please slow down.";

export async function assertNotRateLimited(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  const [groupCount, dmCount] = await Promise.all([
    supabase
      .from("Message")
      .select("id", { count: "exact", head: true })
      .eq("userId", userId)
      .gte("createdAt", since),
    supabase
      .from("DirectMessage")
      .select("id", { count: "exact", head: true })
      .eq("senderId", userId)
      .gte("createdAt", since),
  ]);

  const total = (groupCount.count ?? 0) + (dmCount.count ?? 0);
  if (total >= MAX_MESSAGES_PER_WINDOW) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
}
