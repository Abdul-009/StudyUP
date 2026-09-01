/**
 * Study Up — messaging feature tests.
 *
 * Plain Node script (no test runner). Drives Supabase REST + Realtime directly
 * with real user sessions so it exercises the actual trust boundary.
 *
 *   node tests/messaging.test.mjs
 *
 * See tests/README.md for prerequisites. Run against a disposable project:
 * this creates users / a group / messages / DMs and cleans them up at the end.
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

const TAG = "studyup-test";
const pw = "Test-passw0rd!";
const mk = (n) => `${TAG}+${n}-${Date.now()}@example.com`;

async function createUser(name, email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  // Ensure the public.User row exists / has the name (in case the trigger differs).
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

async function preflight() {
  const m = await admin.from("Message").select("id, isDeleted, replyToId").limit(1);
  if (m.error && /column .* does not exist/i.test(m.error.message)) {
    return "Message.isDeleted / replyToId missing — apply add_soft_delete_to_messages + add_reply_to_messages";
  }
  const dc = await admin.from("DirectConversation").select("id").limit(1);
  if (dc.error && /relation .* does not exist/i.test(dc.error.message)) {
    return "DirectConversation table missing — apply add_direct_messaging";
  }
  const n = await admin.from("Notification").select("readAt").limit(1);
  if (n.error && /column .* does not exist/i.test(n.error.message)) {
    return "Notification.readAt missing — apply add_readAt_to_notifications";
  }
  return null;
}

const cleanup = { userIds: [], groupIds: [] };

async function main() {
  const blocked = await preflight();
  if (blocked) {
    console.error(`\n  BLOCKED: ${blocked}\n`);
    process.exit(3);
  }

  // ---- setup -------------------------------------------------------------
  const eA = mk("alice"), eB = mk("bob"), eC = mk("carol");
  const uA = await createUser("Alice", eA);
  const uB = await createUser("Bob", eB);
  const uC = await createUser("Carol", eC);
  cleanup.userIds.push(uA, uB, uC);

  const { data: g1, error: g1e } = await admin
    .from("Group")
    .insert({ name: `${TAG} shared group`, createdBy: uA })
    .select("id")
    .single();
  if (g1e) throw g1e;
  cleanup.groupIds.push(g1.id);
  await admin.from("GroupMember").insert([
    { groupId: g1.id, userId: uA, role: "ADMIN" },
    { groupId: g1.id, userId: uB, role: "MEMBER" },
  ]);

  const { data: g2 } = await admin
    .from("Group")
    .insert({ name: `${TAG} carol-only group`, createdBy: uC })
    .select("id")
    .single();
  cleanup.groupIds.push(g2.id);
  await admin.from("GroupMember").insert({ groupId: g2.id, userId: uC, role: "MEMBER" });

  const A = await signIn(eA);
  const B = await signIn(eB);
  const C = await signIn(eC);

  // ---- group message delete -------------------------------------------------
  let msg1;
  await check("1  sender can soft-delete own group message", async () => {
    const ins = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "hello from alice" })
      .select("id")
      .single();
    assert(!ins.error, ins.error?.message);
    msg1 = ins.data.id;
    const del = await A.from("Message")
      .update({ isDeleted: true, deletedAt: new Date().toISOString(), content: null })
      .eq("id", msg1)
      .select("id, isDeleted, content");
    assert(!del.error, del.error?.message);
    assert(del.data.length === 1 && del.data[0].isDeleted === true && del.data[0].content === null,
      "row was not soft-deleted");
  });

  await check("2  non-sender CANNOT update another user's group message (needs RLS on Message)", async () => {
    const other = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "alice second message" })
      .select("id")
      .single();
    const attempt = await B.from("Message")
      .update({ isDeleted: true, content: null })
      .eq("id", other.data.id)
      .select("id");
    const blockedByError = !!attempt.error;
    const blockedByZeroRows = !attempt.error && attempt.data.length === 0;
    assert(blockedByError || blockedByZeroRows,
      "Bob was able to modify Alice's message — RLS is not enforced on Message");
  });

  await check("3  soft-delete propagates over realtime to a second client", async () => {
    const ins = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "to be deleted live" })
      .select("id")
      .single();
    const ch = B.channel(`t-msg-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "Message", filter: `groupId=eq.${g1.id}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(ch, 8000, (p) => p.new.id === ins.data.id && p.new.isDeleted === true);
    await A.from("Message").update({ isDeleted: true, content: null }).eq("id", ins.data.id);
    await got;
    await B.removeChannel(ch);
  });

  // ---- reply ------------------------------------------------------------
  await check("4  reply persists replyToId to a message in the same group", async () => {
    const parent = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "parent msg" }).select("id").single();
    const reply = await B.from("Message")
      .insert({ groupId: g1.id, userId: uB, content: "a reply", replyToId: parent.data.id })
      .select("id, replyToId").single();
    assert(!reply.error, reply.error?.message);
    assert(reply.data.replyToId === parent.data.id, "replyToId not stored");
  });

  await check("5  replying to an already-deleted message still works", async () => {
    assert(msg1, "msg1 missing");
    const reply = await B.from("Message")
      .insert({ groupId: g1.id, userId: uB, content: "reply to deleted", replyToId: msg1 })
      .select("id, replyToId").single();
    assert(!reply.error, reply.error?.message);
    assert(reply.data.replyToId === msg1);
  });

  // ---- DMs ------------------------------------------------------------
  const [dmA, dmB] = [uA, uB].sort();
  let convId;
  await check("6  users sharing a group can open a DM conversation and message", async () => {
    const conv = await A.from("DirectConversation")
      .insert({ userAId: dmA, userBId: dmB }).select("id").single();
    assert(!conv.error, `conversation insert failed: ${conv.error?.message}`);
    convId = conv.data.id;
    const dm = await A.from("DirectMessage")
      .insert({ conversationId: convId, senderId: uA, content: "hi bob (dm)" })
      .select("id").single();
    assert(!dm.error, dm.error?.message);
    const read = await B.from("DirectMessage").select("id, content").eq("conversationId", convId);
    assert(!read.error && read.data.length >= 1, "Bob cannot read the DM he should see");
  });

  await check("7  users with NO shared group CANNOT create a DM conversation (needs add_dm_rls_policies)", async () => {
    const [x, y] = [uA, uC].sort();
    const conv = await A.from("DirectConversation")
      .insert({ userAId: x, userBId: y }).select("id");
    if (!conv.error && conv.data?.length) {
      await admin.from("DirectConversation").delete().eq("id", conv.data[0].id);
      throw new Error("Alice created a conversation with Carol despite sharing no group — RLS WITH CHECK missing");
    }
    assert(!!conv.error, "expected an RLS rejection");
  });

  await check("8  repeat conversation create is de-duplicated by the unique (userAId,userBId)", async () => {
    const dup = await A.from("DirectConversation")
      .insert({ userAId: dmA, userBId: dmB }).select("id");
    assert(!!dup.error && /duplicate key|23505/i.test(dup.error.message),
      "second insert of the same pair was not rejected by a unique constraint");
  });

  await check("9  a non-participant reads 0 rows from the conversation and its messages (needs RLS)", async () => {
    assert(convId, "convId missing");
    const conv = await C.from("DirectConversation").select("id").eq("id", convId);
    const msgs = await C.from("DirectMessage").select("id").eq("conversationId", convId);
    assert((conv.data?.length ?? 0) === 0, "Carol can see a conversation she is not part of");
    assert((msgs.data?.length ?? 0) === 0, "Carol can read DMs she is not party to");
  });

  await check("10 non-sender cannot soft-delete a DM (needs RLS UPDATE policy)", async () => {
    const dm = await A.from("DirectMessage")
      .insert({ conversationId: convId, senderId: uA, content: "alice dm to delete" })
      .select("id").single();
    const attempt = await B.from("DirectMessage")
      .update({ isDeleted: true, content: null }).eq("id", dm.data.id).select("id");
    const ok = !!attempt.error || (attempt.data?.length ?? 0) === 0;
    assert(ok, "Bob soft-deleted a DM that Alice sent");
  });

  await check("11 realtime delivers a new DM and its delete-state update to the other participant", async () => {
    const ch = B.channel(`t-dm-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "*", schema: "public", table: "DirectMessage", filter: `conversationId=eq.${convId}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error("channel error — is DirectMessage in supabase_realtime?")) : null)));

    const gotInsert = waitForEvent(ch, 8000, (p) => p.eventType === "INSERT");
    const ins = await A.from("DirectMessage")
      .insert({ conversationId: convId, senderId: uA, content: "live dm" }).select("id").single();
    await gotInsert;

    const gotUpdate = waitForEvent(ch, 8000, (p) => p.eventType === "UPDATE" && p.new.id === ins.data.id);
    await A.from("DirectMessage").update({ isDeleted: true, content: null }).eq("id", ins.data.id);
    await gotUpdate;
    await B.removeChannel(ch);
  });

  // ---- notifications ------------------------------------------------------
  await check("12 bulk mark-as-read scoped to the caller zeroes their unread rows", async () => {
    await admin.from("Notification").insert([
      { userId: uA, type: "NEW_MESSAGE", content: "n1", groupId: g1.id },
      { userId: uA, type: "NEW_MESSAGE", content: "n2", groupId: g1.id },
    ]);
    const upd = await A.from("Notification")
      .update({ isRead: true, readAt: new Date().toISOString() })
      .eq("userId", uA).eq("isRead", false).select("id");
    assert(!upd.error, upd.error?.message);
    const { count } = await A.from("Notification")
      .select("id", { count: "exact", head: true }).eq("userId", uA).eq("isRead", false);
    assert((count ?? 0) === 0, `still ${count} unread after mark-all`);
  });

  await check("13 a notification arriving after clearing still shows as unread", async () => {
    await admin.from("Notification").insert({ userId: uA, type: "NEW_MESSAGE", content: "n3", groupId: g1.id });
    const { count } = await A.from("Notification")
      .select("id", { count: "exact", head: true }).eq("userId", uA).eq("isRead", false);
    assert((count ?? 0) === 1, "new notification not counted as unread");
  });

  await check("14 user B cannot mark user A's notification as read (needs RLS on Notification)", async () => {
    const { data: notif } = await A.from("Notification").select("id").eq("userId", uA).eq("isRead", false).limit(1);
    assert(notif?.length, "no unread notification to target");
    const attempt = await B.from("Notification")
      .update({ isRead: true }).eq("id", notif[0].id).select("id");
    const ok = !!attempt.error || (attempt.data?.length ?? 0) === 0;
    assert(ok, "Bob marked Alice's notification as read — RLS is not enforced on Notification");
  });

  await check("15 mark-as-read UPDATE reaches the NotificationBadge realtime subscription", async () => {
    // NotificationBadge subscribes with filter `userId=eq.<id>` and refetches on
    // any UPDATE. Needs Notification REPLICA IDENTITY FULL for the filter to match.
    const ch = A.channel(`t-notif-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "Notification", filter: `userId=eq.${uA}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error("channel error — is Notification in supabase_realtime?")) : null)));
    const { data: fresh } = await admin.from("Notification")
      .insert({ userId: uA, type: "NEW_MESSAGE", content: "n-live", groupId: g1.id }).select("id").single();
    const got = waitForEvent(ch, 8000, (p) => p.new.id === fresh.id && p.new.isRead === true);
    await A.from("Notification").update({ isRead: true, readAt: new Date().toISOString() }).eq("id", fresh.id);
    await got;
    await A.removeChannel(ch);
  });
}

async function teardown() {
  for (const gid of cleanup.groupIds) await admin.from("Group").delete().eq("id", gid);
  for (const uid of cleanup.userIds) {
    await admin.from("Notification").delete().eq("userId", uid);
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
