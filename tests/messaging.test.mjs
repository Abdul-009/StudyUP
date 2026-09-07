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
  const m = await admin.from("Message").select("id, isDeleted, replyToId, isEdited, mentionedUserIds").limit(1);
  if (m.error && /column .* does not exist/i.test(m.error.message)) {
    return "Message.isDeleted / replyToId / isEdited / mentionedUserIds missing — apply add_soft_delete_to_messages + add_reply_to_messages + add_message_editing + add_message_mentions";
  }
  const u = await admin.from("User").select("id, lastSeenAt").limit(1);
  if (u.error && /column .* does not exist/i.test(u.error.message)) {
    return "User.lastSeenAt missing — apply add_user_last_seen";
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

  // ---- message editing ----------------------------------------------------
  await check("16 a group message content edit propagates over realtime to a second client", async () => {
    const ins = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "before edit" }).select("id").single();
    const ch = B.channel(`t-edit-msg-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "Message", filter: `groupId=eq.${g1.id}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(ch, 8000, (p) => p.new.id === ins.data.id && p.new.isEdited === true && p.new.content === "after edit");
    await A.from("Message").update({ content: "after edit", isEdited: true, editedAt: new Date().toISOString() }).eq("id", ins.data.id);
    await got;
    await B.removeChannel(ch);
  });

  await check("17 a DM content edit propagates over realtime to the other participant", async () => {
    assert(convId, "convId missing");
    const ins = await A.from("DirectMessage")
      .insert({ conversationId: convId, senderId: uA, content: "before edit (dm)" }).select("id").single();
    const ch = B.channel(`t-edit-dm-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "DirectMessage", filter: `conversationId=eq.${convId}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(ch, 8000, (p) => p.new.id === ins.data.id && p.new.isEdited === true && p.new.content === "after edit (dm)");
    await A.from("DirectMessage").update({ content: "after edit (dm)", isEdited: true, editedAt: new Date().toISOString() }).eq("id", ins.data.id);
    await got;
    await B.removeChannel(ch);
  });

  // ---- @mentions ------------------------------------------------------
  await check("18 mentionedUserIds persists and a MENTION notification is created and readable by the mentioned member", async () => {
    const msg = await A.from("Message")
      .insert({ groupId: g1.id, userId: uA, content: "@Bob check this out", mentionedUserIds: [uB] })
      .select("id, mentionedUserIds").single();
    assert(!msg.error, msg.error?.message);
    assert(
      Array.isArray(msg.data.mentionedUserIds) && msg.data.mentionedUserIds.includes(uB),
      "mentionedUserIds not stored on the message",
    );

    const notif = await admin.from("Notification")
      .insert({
        userId: uB,
        type: "MENTION",
        groupId: g1.id,
        refId: msg.data.id,
        content: "Alice mentioned you in " + TAG,
      })
      .select("id").single();
    assert(!notif.error, notif.error?.message);

    const seen = await B.from("Notification").select("id, type").eq("id", notif.data.id).maybeSingle();
    assert(!seen.error && seen.data?.type === "MENTION", "Bob cannot read his own mention notification");
  });

  await check("19 a MENTION notification propagates over realtime to the mentioned member", async () => {
    const ch = B.channel(`t-mention-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "INSERT", schema: "public", table: "Notification", filter: `userId=eq.${uB}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(ch, 8000, (p) => p.new.type === "MENTION");
    await admin.from("Notification").insert({
      userId: uB, type: "MENTION", groupId: g1.id, content: "live mention for bob",
    });
    await got;
    await B.removeChannel(ch);
  });

  // ---- typing indicator (ephemeral broadcast, never persisted) -----------
  await check("20 a typing broadcast on a conversation channel reaches the other participant", async () => {
    const topic = `t-typing-${Date.now()}`;
    const chA = A.channel(topic);
    const chB = B.channel(topic);
    chB.on("broadcast", { event: "typing" }, (p) => chB.__onMatch?.(p));
    await new Promise((r, j) => chB.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    await new Promise((r, j) => chA.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(chB, 5000, (p) => p.payload.userId === uA);
    await chA.send({ type: "broadcast", event: "typing", payload: { userId: uA, name: "Alice" } });
    await got;
    await A.removeChannel(chA);
    await B.removeChannel(chB);
  });

  await check("21 a stopped_typing broadcast reaches the other participant", async () => {
    const topic = `t-typing-stop-${Date.now()}`;
    const chA = A.channel(topic);
    const chB = B.channel(topic);
    chB.on("broadcast", { event: "stopped_typing" }, (p) => chB.__onMatch?.(p));
    await new Promise((r, j) => chB.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    await new Promise((r, j) => chA.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    const got = waitForEvent(chB, 5000, (p) => p.payload.userId === uA);
    await chA.send({ type: "broadcast", event: "stopped_typing", payload: { userId: uA } });
    await got;
    await A.removeChannel(chA);
    await B.removeChannel(chB);
  });

  // ---- presence / online status -------------------------------------------
  await check("22 presence track on a shared channel is visible to another subscriber via sync", async () => {
    const topic = `t-presence-${Date.now()}`;
    const chA = A.channel(topic, { config: { presence: { key: uA } } });
    const chB = B.channel(topic, { config: { presence: { key: uB } } });

    // A single sync handler, registered before subscribe() (supabase-js
    // forbids adding channel callbacks afterward) — resolves whichever of
    // the two waiters below currently matches the presence state.
    let onSync = () => {};
    chB.on("presence", { event: "sync" }, () => onSync());

    await new Promise((r, j) => chB.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));
    await new Promise((r, j) => chA.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));

    const sawUaOnline = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("uA never appeared in presence state")), 8000);
      onSync = () => {
        if (Object.keys(chB.presenceState()).includes(uA)) {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    await chA.track({ onlineAt: new Date().toISOString() });
    await sawUaOnline;

    // Leaving (untrack) should drop uA back out of the presence state.
    const sawUaOffline = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("uA never left presence state")), 8000);
      onSync = () => {
        if (!Object.keys(chB.presenceState()).includes(uA)) {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    await chA.untrack();
    await sawUaOffline;

    await A.removeChannel(chA);
    await B.removeChannel(chB);
  });

  await check("23 a user can update their own lastSeenAt (heartbeat / disconnect write)", async () => {
    const before = new Date().toISOString();
    const upd = await A.from("User").update({ lastSeenAt: before }).eq("id", uA).select("id, lastSeenAt");
    assert(!upd.error, upd.error?.message);
    assert(upd.data?.[0]?.lastSeenAt, "lastSeenAt was not written");
  });

  // ---- cursor-based message pagination ----------------------------------
  // Mirrors src/lib/messages-pagination.ts `olderThanCursorFilter` +
  // fetchGroupMessages / fetchDirectMessages: walk newest-first ordered by
  // (createdAt DESC, id DESC), each page everything strictly older than the
  // (createdAt, id) of the last row of the previous page.
  const olderThanCursor = (c) =>
    `createdAt.lt.${c.createdAt},and(createdAt.eq.${c.createdAt},id.lt.${c.id})`;

  async function fetchPage(client, table, keyCol, keyVal, cursor, limit) {
    let q = client
      .from(table)
      .select("id, createdAt")
      .eq(keyCol, keyVal)
      .order("createdAt", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.or(olderThanCursor(cursor));
    const { data, error } = await q;
    assert(!error, error?.message);
    const page = data.slice(0, limit);
    const hasMore = data.length > limit;
    const oldest = page[page.length - 1];
    return {
      page,
      hasMore,
      nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
    };
  }

  let pgGroupId;
  await check("24 seed a 130-message group thread for pagination", async () => {
    const { data: g, error } = await admin
      .from("Group")
      .insert({ name: `${TAG} pagination group`, createdBy: uA })
      .select("id")
      .single();
    assert(!error, error?.message);
    pgGroupId = g.id;
    cleanup.groupIds.push(g.id);
    await admin.from("GroupMember").insert({ groupId: g.id, userId: uA, role: "ADMIN" });

    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const rows = [];
    for (let i = 0; i < 125; i++) {
      rows.push({ groupId: g.id, userId: uA, content: `m${i}`, createdAt: new Date(base + i * 1000).toISOString() });
    }
    // 5 messages sharing one timestamp — exercises the id tiebreaker at a page edge.
    const clusterTs = new Date(base + 125_000).toISOString();
    for (let i = 0; i < 5; i++) {
      rows.push({ groupId: g.id, userId: uA, content: `cluster${i}`, createdAt: clusterTs });
    }
    for (let i = 0; i < rows.length; i += 50) {
      const { error: e } = await admin.from("Message").insert(rows.slice(i, i + 50));
      assert(!e, e?.message);
    }
    const { count } = await admin.from("Message").select("id", { count: "exact", head: true }).eq("groupId", g.id);
    assert(count === 130, `seeded ${count}, expected 130`);
  });

  await check("25 first page is the newest 50, ordered newest-first, with hasMore = true", async () => {
    const { page, hasMore, nextCursor } = await fetchPage(A, "Message", "groupId", pgGroupId, null, 50);
    assert(page.length === 50, `got ${page.length}`);
    assert(hasMore === true, "hasMore should be true with 130 messages");
    assert(nextCursor, "nextCursor missing");
    for (let i = 1; i < page.length; i++) {
      const a = page[i - 1], b = page[i];
      const ordered = a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);
      assert(ordered, `page not strictly newest-first at index ${i}`);
    }
  });

  await check("26 cursor paging tiles the whole thread — no gaps, no overlaps, terminates", async () => {
    const seen = new Set();
    let cursor = null, pages = 0, guard = 0;
    for (;;) {
      const { page, hasMore, nextCursor } = await fetchPage(A, "Message", "groupId", pgGroupId, cursor, 50);
      pages++;
      for (const row of page) {
        assert(!seen.has(row.id), `message ${row.id} served on more than one page`);
        seen.add(row.id);
      }
      if (!hasMore) break;
      assert(nextCursor, "hasMore but no nextCursor");
      cursor = nextCursor;
      assert(++guard <= 20, "pagination did not terminate");
    }
    assert(seen.size === 130, `covered ${seen.size} of 130 messages`);
    assert(pages === 3, `expected 3 pages of 50/50/30, got ${pages}`);
  });

  await check("27 identical-timestamp messages split across a boundary without dup or skip", async () => {
    // limit 3 so the 5-message identical-timestamp cluster must straddle a boundary.
    const seen = new Set();
    let cursor = null, guard = 0;
    for (;;) {
      const { page, hasMore, nextCursor } = await fetchPage(A, "Message", "groupId", pgGroupId, cursor, 3);
      for (const row of page) {
        assert(!seen.has(row.id), `message ${row.id} duplicated across a page boundary`);
        seen.add(row.id);
      }
      if (!hasMore) break;
      cursor = nextCursor;
      assert(++guard <= 100, "pagination did not terminate");
    }
    assert(seen.size === 130, `covered ${seen.size} of 130 with a small page size`);
  });

  await check("28 DM history pages by the same cursor rule", async () => {
    assert(convId, "convId missing");
    const base = Date.parse("2026-02-01T00:00:00.000Z");
    const rows = [];
    for (let i = 0; i < 60; i++) {
      rows.push({ conversationId: convId, senderId: uA, content: `d${i}`, createdAt: new Date(base + i * 1000).toISOString() });
    }
    for (let i = 0; i < rows.length; i += 50) {
      const { error: e } = await admin.from("DirectMessage").insert(rows.slice(i, i + 50));
      assert(!e, e?.message);
    }

    const seen = new Set();
    let cursor = null, guard = 0;
    for (;;) {
      const { page, hasMore, nextCursor } = await fetchPage(B, "DirectMessage", "conversationId", convId, cursor, 50);
      for (const row of page) {
        assert(!seen.has(row.id), `DM ${row.id} served on more than one page`);
        seen.add(row.id);
      }
      if (!hasMore) break;
      cursor = nextCursor;
      assert(++guard <= 20, "DM pagination did not terminate");
    }
    // >= 60: earlier checks also left a handful of DMs in this conversation.
    assert(seen.size >= 60, `covered ${seen.size} DMs, expected at least the 60 just seeded`);
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
