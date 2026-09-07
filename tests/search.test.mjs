/**
 * Study Up — message search tests.
 *
 * searchGroupMessages/searchDirectMessages are Server Actions (next/headers),
 * not callable directly from a script — same limitation as every other
 * action in this codebase. This exercises the exact query shape the actions
 * use (ilike + scoped by groupId/conversationId + isDeleted=false) against
 * real data, with a real user session.
 *
 *   node tests/search.test.mjs
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

const TAG = "studyup-search-test";
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

const cleanup = { userIds: [], groupIds: [] };

async function main() {
  const eA = mk("alice");
  const uA = await createUser("Alice Search", eA);
  cleanup.userIds.push(uA);
  const A = await signIn(eA);

  const { data: g1 } = await admin.from("Group").insert({ name: `${TAG} g1`, createdBy: uA }).select("id").single();
  const { data: g2 } = await admin.from("Group").insert({ name: `${TAG} g2`, createdBy: uA }).select("id").single();
  cleanup.groupIds.push(g1.id, g2.id);
  await admin.from("GroupMember").insert([
    { groupId: g1.id, userId: uA, role: "ADMIN" },
    { groupId: g2.id, userId: uA, role: "ADMIN" },
  ]);

  const needle = `zzyzx${Date.now()}`;
  await admin.from("Message").insert({ groupId: g1.id, userId: uA, content: `found me ${needle} here` });
  await admin.from("Message").insert({ groupId: g2.id, userId: uA, content: `also has ${needle} but wrong group` });
  const { data: deletedMsg } = await admin.from("Message")
    .insert({ groupId: g1.id, userId: uA, content: `deleted ${needle} content` }).select("id").single();
  await admin.from("Message").update({ isDeleted: true, content: null }).eq("id", deletedMsg.id);

  await check("1  search is scoped to the correct group only", async () => {
    const { data } = await A.from("Message")
      .select("id, content").eq("groupId", g1.id).eq("isDeleted", false).ilike("content", `%${needle}%`);
    assert(data.length === 1, `expected 1 match in g1, got ${data.length}`);
    assert(data[0].content.includes("found me"), "wrong message matched");

    const { data: g2Data } = await A.from("Message")
      .select("id").eq("groupId", g2.id).eq("isDeleted", false).ilike("content", `%${needle}%`);
    assert(g2Data.length === 1, "g2's own match should still be found when searching g2");
  });

  await check("2  search excludes soft-deleted messages", async () => {
    const { data } = await A.from("Message")
      .select("id").eq("groupId", g1.id).eq("isDeleted", false).ilike("content", "%deleted%");
    assert(data.length === 0, "a soft-deleted message's (now-null) content should never match");
  });

  // ---- DMs ------------------------------------------------------------
  const eB = mk("bob");
  const uB = await createUser("Bob Search", eB);
  cleanup.userIds.push(uB);
  await admin.from("GroupMember").insert({ groupId: g1.id, userId: uB, role: "MEMBER" });

  const [dmA, dmB] = [uA, uB].sort();
  const { data: conv1 } = await admin.from("DirectConversation").insert({ userAId: dmA, userBId: dmB }).select("id").single();

  const eC = mk("carol");
  const uC = await createUser("Carol Search", eC);
  cleanup.userIds.push(uC);
  await admin.from("GroupMember").insert({ groupId: g1.id, userId: uC, role: "MEMBER" });
  const [dmA2, dmC] = [uA, uC].sort();
  const { data: conv2 } = await admin.from("DirectConversation").insert({ userAId: dmA2, userBId: dmC }).select("id").single();

  await admin.from("DirectMessage").insert({ conversationId: conv1.id, senderId: uA, content: `dm needle ${needle} with bob` });
  await admin.from("DirectMessage").insert({ conversationId: conv2.id, senderId: uA, content: `dm needle ${needle} with carol` });

  await check("3  DM search is scoped to the correct conversation only", async () => {
    const { data } = await A.from("DirectMessage")
      .select("id, content").eq("conversationId", conv1.id).eq("isDeleted", false).ilike("content", `%${needle}%`);
    assert(data.length === 1, `expected 1 match in conv1, got ${data.length}`);
    assert(data[0].content.includes("with bob"), "wrong conversation's message matched");
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
