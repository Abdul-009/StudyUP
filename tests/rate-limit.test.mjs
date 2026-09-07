/**
 * Study Up — message-send rate-limit tests.
 *
 * Imports the actual src/lib/rate-limit.ts module directly (Node's
 * --experimental-strip-types handles it — the file's only non-runtime bit is
 * an `import type`, which gets fully erased) and drives it against a real
 * Supabase project with real user sessions, same trust boundary as
 * tests/messaging.test.mjs.
 *
 *   node --experimental-strip-types tests/rate-limit.test.mjs
 *
 * Run against a disposable project: creates users / a group / a DM
 * conversation / messages and cleans them up at the end.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertNotRateLimited, RATE_LIMIT_MESSAGE } from "../src/lib/rate-limit.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
async function assertThrows(fn, msg) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error(msg);
}

const TAG = "studyup-ratelimit-test";
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
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  return c;
}

// Inserts `count` Message rows for `userId` in `groupId`, `createdAt` offset
// `secondsAgo` seconds into the past (so we can plant rows either inside or
// outside the rate-limit window without waiting in real time).
async function seedGroupMessages(groupId, userId, count, secondsAgo) {
  const createdAt = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const rows = Array.from({ length: count }, (_, i) => ({
    groupId, userId, content: `seed ${i}`, createdAt,
  }));
  const { error } = await admin.from("Message").insert(rows);
  if (error) throw error;
}
async function seedDirectMessages(conversationId, senderId, count, secondsAgo) {
  const createdAt = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const rows = Array.from({ length: count }, (_, i) => ({
    conversationId, senderId, content: `seed ${i}`, createdAt,
  }));
  const { error } = await admin.from("DirectMessage").insert(rows);
  if (error) throw error;
}

const cleanup = { userIds: [], groupIds: [] };

async function main() {
  const eA = mk("alice"), eB = mk("bob");
  const uA = await createUser("Alice RL", eA);
  const uB = await createUser("Bob RL", eB);
  cleanup.userIds.push(uA, uB);

  const { data: group, error: groupErr } = await admin
    .from("Group").insert({ name: `${TAG} group`, createdBy: uA }).select("id").single();
  if (groupErr) throw groupErr;
  cleanup.groupIds.push(group.id);
  await admin.from("GroupMember").insert([
    { groupId: group.id, userId: uA, role: "ADMIN" },
    { groupId: group.id, userId: uB, role: "MEMBER" },
  ]);

  const A = await signIn(eA);
  const B = await signIn(eB);

  // Backdated by 0s (as recent as possible) and seeded in as few round trips
  // as the test needs, so slow network conditions can't let earlier rows
  // age out of the 10s window before a later assertion runs.
  await check("1  under the limit does not throw", async () => {
    await seedGroupMessages(group.id, uA, 9, 0);
    await assertNotRateLimited(A, uA); // no throw
  });

  await check("2  at the limit (10 recent group messages) throws the exact rate-limit message", async () => {
    await seedGroupMessages(group.id, uA, 1, 0); // brings Alice to 10 in the last few seconds
    const err = await assertThrows(
      () => assertNotRateLimited(A, uA),
      "expected assertNotRateLimited to throw once at the limit",
    );
    assert(err.message === RATE_LIMIT_MESSAGE, `got wrong message: ${err.message}`);
  });

  await check("3  group + DM sends share one budget (combined count trips the limit)", async () => {
    // Fresh count: 6 group + 5 DM = 11, over the limit, for a user with zero
    // prior activity in this test run.
    const eC = mk("carol");
    const uC = await createUser("Carol RL", eC);
    cleanup.userIds.push(uC);
    await admin.from("GroupMember").insert({ groupId: group.id, userId: uC, role: "MEMBER" });
    const [dmA2, dmB2] = [uA, uC].sort();
    const { data: conv2 } = await admin
      .from("DirectConversation").insert({ userAId: dmA2, userBId: dmB2 }).select("id").single();

    await Promise.all([
      seedGroupMessages(group.id, uC, 6, 0),
      seedDirectMessages(conv2.id, uC, 5, 0),
    ]);

    const C = await signIn(eC);
    const err = await assertThrows(
      () => assertNotRateLimited(C, uC),
      "expected combined group+DM count to trip the limit",
    );
    assert(err.message === RATE_LIMIT_MESSAGE, `got wrong message: ${err.message}`);
  });

  await check("4  messages outside the 10s window do not count toward the limit", async () => {
    const eD = mk("dave");
    const uD = await createUser("Dave RL", eD);
    cleanup.userIds.push(uD);
    await admin.from("GroupMember").insert({ groupId: group.id, userId: uD, role: "MEMBER" });
    const D = await signIn(eD);

    // 20 messages, but all well outside the 10-second window.
    await seedGroupMessages(group.id, uD, 20, 60);
    await assertNotRateLimited(D, uD); // should not throw
  });

  await check("5  the limit is tracked per-user, not globally — Bob is unaffected by Alice's spam", async () => {
    // Alice is already over the limit from check 2. Bob has sent nothing.
    await assertNotRateLimited(B, uB); // should not throw
  });
}

async function teardown() {
  for (const gid of cleanup.groupIds) await admin.from("Group").delete().eq("id", gid);
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
