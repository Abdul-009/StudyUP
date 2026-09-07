/**
 * Study Up — group management tests (leave / remove member / edit details /
 * regenerate invite code).
 *
 * The actions under test (src/app/groups/[groupId]/settings/actions.ts) are
 * Next.js Server Actions that read cookies via next/headers — they can't be
 * imported and called directly from a standalone script (same limitation as
 * every other "use server" action in this codebase; see tests/README.md).
 * So, same approach as tests/messaging.test.mjs: drive the underlying
 * Supabase tables + Realtime directly with real user sessions to verify the
 * data-layer mechanics and realtime propagation those actions rely on.
 *
 * What this does NOT cover: the admin-only authorization checks themselves
 * (requireAdmin() inside the actions) — Group/GroupMember have no RLS (same
 * convention as Message/Notification: server-action-enforced trust
 * boundary), so a raw table write bypasses that check entirely. Check 2
 * below documents this gap explicitly, the same way messaging.test.mjs's
 * checks 2/14 do for Message/Notification.
 *
 *   node tests/group-management.test.mjs
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

const TAG = "studyup-groupmgmt-test";
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
  const eA = mk("alice"), eB = mk("bob"), eC = mk("carol");
  const uA = await createUser("Alice GM", eA);
  const uB = await createUser("Bob GM", eB);
  const uC = await createUser("Carol GM", eC);
  cleanup.userIds.push(uA, uB, uC);

  const A = await signIn(eA);
  const B = await signIn(eB);

  // ---- leave group (not last member, not sole admin) ---------------------
  await check("1  a regular member leaving deletes only their own membership", async () => {
    const { data: group } = await admin
      .from("Group").insert({ name: `${TAG} g1`, createdBy: uA }).select("id").single();
    cleanup.groupIds.push(group.id);
    await admin.from("GroupMember").insert([
      { groupId: group.id, userId: uA, role: "ADMIN" },
      { groupId: group.id, userId: uB, role: "MEMBER" },
      { groupId: group.id, userId: uC, role: "MEMBER" },
    ]);

    const own = await B.from("GroupMember").select("id").eq("groupId", group.id).eq("userId", uB).single();
    const del = await B.from("GroupMember").delete().eq("id", own.data.id).select("id");
    assert(!del.error && del.data.length === 1, "Bob could not leave (delete his own membership)");

    const { data: remaining } = await admin.from("GroupMember").select("userId").eq("groupId", group.id);
    assert(remaining.length === 2 && remaining.every((r) => r.userId !== uB), "other memberships were affected");
  });

  // ---- remove member: documents the RLS gap, same style as messaging.test.mjs ----
  await check("2  non-admin CAN delete another member's row directly (needs RLS on GroupMember; removeMember() itself enforces admin-only via requireAdmin())", async () => {
    const { data: group } = await admin
      .from("Group").insert({ name: `${TAG} g2`, createdBy: uA }).select("id").single();
    cleanup.groupIds.push(group.id);
    await admin.from("GroupMember").insert([
      { groupId: group.id, userId: uA, role: "ADMIN" },
      { groupId: group.id, userId: uB, role: "MEMBER" },
      { groupId: group.id, userId: uC, role: "MEMBER" },
    ]);

    const target = await admin.from("GroupMember").select("id").eq("groupId", group.id).eq("userId", uC).single();
    // Bob (a non-admin) removing Carol directly against the table — this is
    // expected to succeed today, same known gap as Message/Notification.
    const attempt = await B.from("GroupMember").delete().eq("id", target.data.id).select("id");
    assert(!attempt.error && attempt.data.length === 1, "expected the raw delete to succeed (documenting the gap)");
  });

  // ---- remove member as admin: removed member loses access on next fetch ----
  await check("3  after an admin removes a member, that member's own membership check returns nothing (page.tsx access-gate)", async () => {
    const { data: group } = await admin
      .from("Group").insert({ name: `${TAG} g3`, createdBy: uA }).select("id").single();
    cleanup.groupIds.push(group.id);
    await admin.from("GroupMember").insert([
      { groupId: group.id, userId: uA, role: "ADMIN" },
      { groupId: group.id, userId: uC, role: "MEMBER" },
    ]);

    // Simulates removeMember(groupId, uC) called by admin Alice.
    const target = await admin.from("GroupMember").select("id").eq("groupId", group.id).eq("userId", uC).single();
    const del = await A.from("GroupMember").delete().eq("id", target.data.id).select("id");
    assert(!del.error && del.data.length === 1, "admin could not remove Carol");

    // Every group subpage (chat/files/announcements/assignments/polls/settings)
    // gates on exactly this query and redirects away when it comes back empty.
    const { data: stillMember } = await admin
      .from("GroupMember").select("id").eq("groupId", group.id).eq("userId", uC).maybeSingle();
    assert(!stillMember, "Carol's membership still exists after removal");
  });

  // ---- edit group details propagates live ---------------------------------
  await check("4  a Group UPDATE (name/description/accentColor) propagates over realtime to a client with the chat open", async () => {
    const { data: group } = await admin
      .from("Group").insert({ name: `${TAG} g4 old name`, createdBy: uA, accentColor: "#1AA76B" })
      .select("id").single();
    cleanup.groupIds.push(group.id);
    await admin.from("GroupMember").insert({ groupId: group.id, userId: uA, role: "ADMIN" });

    const ch = A.channel(`t-group-${Date.now()}`);
    ch.on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "Group", filter: `id=eq.${group.id}` },
      (p) => ch.__onMatch?.(p));
    await new Promise((r, j) => ch.subscribe((s) => (s === "SUBSCRIBED" ? r() : s === "CHANNEL_ERROR" ? j(new Error(s)) : null)));

    const got = waitForEvent(ch, 8000, (p) =>
      p.new.name === `${TAG} g4 new name` && p.new.accentColor === "#159C8C");
    await admin.from("Group")
      .update({ name: `${TAG} g4 new name`, description: "updated live", accentColor: "#159C8C" })
      .eq("id", group.id);
    await got;
    await A.removeChannel(ch);
  });

  // ---- regenerate invite code invalidates the old one ---------------------
  await check("5  regenerating the invite code means the old code no longer matches (what joinGroup checks against)", async () => {
    const oldCode = `OLD${Date.now()}`.slice(0, 12);
    const { data: group } = await admin
      .from("Group")
      .insert({ name: `${TAG} g5`, createdBy: uA, isPrivate: true, inviteCode: oldCode })
      .select("id, inviteCode").single();
    cleanup.groupIds.push(group.id);
    assert(group.inviteCode === oldCode, "setup: old code not stored");

    const newCode = `NEW${Date.now()}`.slice(0, 12);
    const upd = await admin.from("Group").update({ inviteCode: newCode }).eq("id", group.id).select("inviteCode").single();
    assert(!upd.error, upd.error?.message);
    assert(upd.data.inviteCode === newCode, "invite code was not replaced");

    // This is exactly what joinGroup() compares against — the old code no
    // longer equals the stored value, so it would now be rejected.
    const { data: current } = await admin.from("Group").select("inviteCode").eq("id", group.id).single();
    assert(current.inviteCode !== oldCode, "old code still matches — it would still work");
    assert(current.inviteCode === newCode, "current code isn't the regenerated one");
  });

  // ---- last member leaving deletes the group (auto-archive rule) ---------
  await check("6  deleting a group (last-member-leaves path) cascades to remove its GroupMember rows", async () => {
    const { data: group } = await admin
      .from("Group").insert({ name: `${TAG} g6 solo`, createdBy: uA }).select("id").single();
    await admin.from("GroupMember").insert({ groupId: group.id, userId: uA, role: "ADMIN" });

    // Simulates leaveGroup()'s "others.length === 0" branch.
    const del = await A.from("Group").delete().eq("id", group.id).select("id");
    assert(!del.error && del.data.length === 1, "the sole member could not delete the group");

    const { data: orphaned } = await admin.from("GroupMember").select("id").eq("groupId", group.id);
    assert(orphaned.length === 0, "GroupMember rows survived the group's deletion — cascade not working");
  });
}

async function teardown() {
  for (const gid of cleanup.groupIds) {
    try {
      await admin.from("Group").delete().eq("id", gid);
    } catch {
      /* already deleted by a check (e.g. check 6) — fine */
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
