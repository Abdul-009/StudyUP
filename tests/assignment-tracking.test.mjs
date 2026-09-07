/**
 * Study Up — assignment completion tracking + due-date reminder tests.
 *
 * Completion toggling is exercised at the data layer with real user sessions
 * (same approach as every other "use server" action in this codebase — see
 * tests/messaging.test.mjs). The reminder job, unlike a Server Action, is a
 * real Next.js Route Handler at a stable URL, so it's tested end-to-end via
 * an actual HTTP call against a running dev server.
 *
 *   npm run dev                                    (in one terminal)
 *   node tests/assignment-tracking.test.mjs         (in another)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.TEST_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET; // optional — route allows unauthenticated calls if unset
if (!URL || !ANON || !SERVICE) {
  console.error("Missing Supabase env vars in .env.local");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["PASS", name, ""]);
    passed++;
  } catch (err) {
    results.push(["FAIL", name, err.message]);
    failed++;
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function waitForEvent(channel, ms, predicate) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`no realtime event within ${ms}ms`)), ms);
    channel.__onMatch = (payload) => {
      if (!predicate || predicate(payload)) {
        clearTimeout(timer);
        res(payload);
      }
    };
  });
}

async function callCronRoute() {
  const res = await fetch(`${APP_URL}/api/cron/assignment-reminders`, {
    headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const TAG = "studyup-assignmenttrack-test";
const pw = "Test-passw0rd!";
const mk = (n) => `${TAG}+${n}-${Date.now()}@example.com`;

async function createUser(name, email) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: pw, email_confirm: true, user_metadata: { name },
  });
  if (error) throw error;
  await admin.from("User").upsert({ id: data.user.id, email, name }, { onConflict: "id" });
  return data.user.id;
}
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  c.realtime.setAuth(data.session.access_token);
  return c;
}

const cleanup = { userIds: [], groupIds: [] };

async function main() {
  // Confirm the dev server is actually reachable before running HTTP-based checks.
  try {
    await fetch(APP_URL, { method: "HEAD" });
  } catch {
    console.error(`\n  BLOCKED: ${APP_URL} isn't reachable — run \`npm run dev\` first.\n`);
    process.exit(3);
  }

  const eA = mk("alice"), eB = mk("bob");
  const uA = await createUser("Alice AT", eA);
  const uB = await createUser("Bob AT", eB);
  cleanup.userIds.push(uA, uB);

  const { data: group } = await admin
    .from("Group").insert({ name: `${TAG} group`, createdBy: uA }).select("id").single();
  cleanup.groupIds.push(group.id);
  await admin.from("GroupMember").insert([
    { groupId: group.id, userId: uA, role: "ADMIN" },
    { groupId: group.id, userId: uB, role: "MEMBER" },
  ]);

  const A = await signIn(eA);
  const B = await signIn(eB);

  const { data: assignment } = await admin
    .from("Assignment")
    .insert({ groupId: group.id, createdBy: uA, title: `${TAG} homework`, dueDate: new Date(Date.now() + 3 * 86400_000).toISOString() })
    .select("id").single();

  // ---- completion toggling -------------------------------------------------
  await check("1  marking complete inserts a row that reflects for that user only", async () => {
    const upsert = await A.from("AssignmentCompletion")
      .upsert({ assignmentId: assignment.id, userId: uA, groupId: group.id }, { onConflict: "assignmentId,userId" })
      .select("id, completedAt, groupId");
    assert(!upsert.error, upsert.error?.message);
    assert(upsert.data[0].completedAt, "completedAt was not set (schema default)");
    assert(upsert.data[0].groupId === group.id, "denormalized groupId not stored");

    const { data: rows } = await admin.from("AssignmentCompletion").select("userId").eq("assignmentId", assignment.id);
    assert(rows.length === 1 && rows[0].userId === uA, "Bob's completion should not exist yet");
  });

  await check("2  marking incomplete deletes the row (not a null timestamp)", async () => {
    const del = await A.from("AssignmentCompletion").delete()
      .eq("assignmentId", assignment.id).eq("userId", uA).select("id");
    assert(!del.error && del.data.length === 1, "expected the row to be deleted");
    const { data: rows } = await admin.from("AssignmentCompletion").select("id").eq("assignmentId", assignment.id);
    assert(rows.length === 0, "row still exists after marking incomplete");
  });

  await check("3  a completion propagates over realtime to another group member viewing the list", async () => {
    const ch = B.channel(`t-assign-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "INSERT", schema: "public", table: "AssignmentCompletion", filter: `groupId=eq.${group.id}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));

    const got = waitForEvent(ch, 8000, (p) => p.new.assignmentId === assignment.id && p.new.userId === uA);
    await A.from("AssignmentCompletion").upsert(
      { assignmentId: assignment.id, userId: uA, groupId: group.id },
      { onConflict: "assignmentId,userId" },
    );
    await got;
    await B.removeChannel(ch);
  });

  // ---- due-date reminder job (real HTTP route) -----------------------------
  const { data: dueSoon } = await admin
    .from("Assignment")
    .insert({ groupId: group.id, createdBy: uA, title: `${TAG} due soon`, dueDate: new Date(Date.now() + 12 * 3600_000).toISOString() })
    .select("id").single();
  // Bob has NOT completed dueSoon; Alice HAS.
  await admin.from("AssignmentCompletion").upsert(
    { assignmentId: dueSoon.id, userId: uA, groupId: group.id },
    { onConflict: "assignmentId,userId" },
  );

  await check("4  the reminder job creates exactly one notification for the member who hasn't completed it", async () => {
    const { status, body } = await callCronRoute();
    assert(status === 200, `unexpected status ${status}: ${JSON.stringify(body)}`);

    const { data: notifs } = await admin
      .from("Notification").select("id, userId").eq("type", "ASSIGNMENT_REMINDER").eq("refId", dueSoon.id);
    assert(notifs.length === 1, `expected exactly 1 reminder, got ${notifs.length}`);
    assert(notifs[0].userId === uB, "reminder went to the wrong user");
  });

  await check("5  a second cron run does not create a duplicate (not one per cron run)", async () => {
    await callCronRoute();
    await callCronRoute();
    const { data: notifs } = await admin
      .from("Notification").select("id").eq("type", "ASSIGNMENT_REMINDER").eq("refId", dueSoon.id);
    assert(notifs.length === 1, `expected still exactly 1 reminder after repeat runs, got ${notifs.length}`);
  });

  await check("6  concurrent cron runs still produce exactly one notification per user (dedup index, not just app-level check)", async () => {
    const { data: fresh } = await admin
      .from("Assignment")
      .insert({ groupId: group.id, createdBy: uA, title: `${TAG} concurrent`, dueDate: new Date(Date.now() + 6 * 3600_000).toISOString() })
      .select("id").single();
    // Both Alice and Bob are members and neither has completed this one, so
    // both legitimately qualify — the dedup guarantee is "at most one per
    // user", not "at most one total".

    await Promise.all([callCronRoute(), callCronRoute(), callCronRoute()]);

    const { data: notifs } = await admin
      .from("Notification").select("id, userId").eq("type", "ASSIGNMENT_REMINDER").eq("refId", fresh.id);
    const byUser = new Map();
    for (const n of notifs) byUser.set(n.userId, (byUser.get(n.userId) ?? 0) + 1);
    assert(byUser.size === 2, `expected reminders for both members, got users: ${[...byUser.keys()]}`);
    for (const [userId, count] of byUser) {
      assert(count === 1, `user ${userId} got ${count} reminders instead of 1 — concurrent runs produced a duplicate`);
    }
  });

  await check("7  an assignment outside the reminder window gets no reminder", async () => {
    const { data: farOut } = await admin
      .from("Assignment")
      .insert({ groupId: group.id, createdBy: uA, title: `${TAG} far out`, dueDate: new Date(Date.now() + 5 * 86400_000).toISOString() })
      .select("id").single();

    await callCronRoute();

    const { data: notifs } = await admin
      .from("Notification").select("id").eq("type", "ASSIGNMENT_REMINDER").eq("refId", farOut.id);
    assert(notifs.length === 0, "assignment 5 days out should not have been reminded yet");
  });

  await check("8  a user who already completed the assignment gets no reminder", async () => {
    const { data: notifs } = await admin
      .from("Notification").select("id").eq("type", "ASSIGNMENT_REMINDER").eq("refId", dueSoon.id).eq("userId", uA);
    assert(notifs.length === 0, "Alice already completed this assignment and should not be reminded");
  });
}

async function teardown() {
  for (const gid of cleanup.groupIds) {
    try {
      await admin.from("Group").delete().eq("id", gid);
    } catch {
      /* ignore */
    }
  }
  for (const uid of cleanup.userIds) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

main()
  .catch((err) => {
    results.push(["FAIL", "harness", err.message]);
    failed++;
  })
  .finally(async () => {
    await teardown().catch((e) => console.error("teardown error:", e.message));
    console.log("");
    for (const [status, name, detail] of results) {
      console.log(`  ${status}  ${name}${detail ? `\n        ↳ ${detail}` : ""}`);
    }
    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  });
