/**
 * Study Up — profile propagation + password reset tests.
 *
 * Profile editing is exercised at the data layer with a real user session
 * (same approach as every other "use server" action in this codebase).
 * Password reset is tested genuinely end-to-end: admin.generateLink() gets a
 * real Supabase recovery link without needing an actual inbox, then the
 * script does exactly what /auth/callback + the reset-password page do
 * (verifyOtp -> session -> updateUser({password}) -> sign in with the new
 * password) to prove the whole flow actually works.
 *
 *   node tests/profile-and-password.test.mjs
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

const TAG = "studyup-profilepw-test";
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
async function signIn(email, password = pw) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: c, session: data.session };
}

const cleanup = { userIds: [], groupIds: [] };

async function main() {
  const eA = mk("alice"), eB = mk("bob");
  const uA = await createUser("Alice Original", eA);
  const uB = await createUser("Bob PP", eB);
  cleanup.userIds.push(uA, uB);

  const { data: group } = await admin
    .from("Group").insert({ name: `${TAG} group`, createdBy: uA }).select("id").single();
  cleanup.groupIds.push(group.id);
  await admin.from("GroupMember").insert([
    { groupId: group.id, userId: uA, role: "ADMIN" },
    { groupId: group.id, userId: uB, role: "MEMBER" },
  ]);

  // ---- profile editing propagation -----------------------------------------
  await check("1  no message table stores a redundant copy of the sender's name", async () => {
    // Insert real rows (rather than trusting whatever happens to already
    // exist) so an empty table can't make this pass vacuously.
    const { data: msgRow } = await admin.from("Message")
      .insert({ groupId: group.id, userId: uA, content: "denorm check" }).select("*").single();
    const [dmA, dmB] = [uA, uB].sort();
    const { data: conv } = await admin.from("DirectConversation").insert({ userAId: dmA, userBId: dmB }).select("id").single();
    const { data: dmRow } = await admin.from("DirectMessage")
      .insert({ conversationId: conv.id, senderId: uA, content: "denorm check" }).select("*").single();

    // Matches a column that looks like a denormalized *person's* name
    // (senderName, userName, authorName, ...) without flagging legitimate
    // unrelated columns like attachmentName (an uploaded file's filename).
    const suspect = (row) =>
      Object.keys(row ?? {}).some((k) => /(sender|user|author|poster|creator)name/i.test(k));
    assert(!suspect(msgRow), "Message has a denormalized sender-name column");
    assert(!suspect(dmRow), "DirectMessage has a denormalized sender-name column");
  });

  const { client: A } = await signIn(eA);

  await check("2  updating the display name reflects immediately for a fresh read (group member list)", async () => {
    const { error } = await A.from("User").update({ name: "Alice Renamed" }).eq("id", uA);
    assert(!error, error?.message);

    // Exactly what the group settings / chat member-list pages do: join
    // GroupMember -> User fresh on every request.
    const { data: memberRows } = await admin.from("GroupMember").select("userId").eq("groupId", group.id);
    const { data: users } = await admin.from("User").select("id, name").in("id", memberRows.map((m) => m.userId));
    const alice = users.find((u) => u.id === uA);
    assert(alice.name === "Alice Renamed", "member list did not reflect the renamed user");
  });

  await check("3  updating the avatar reflects immediately for a fresh read (DM header)", async () => {
    const newUrl = "https://example.com/avatars/alice-new.png";
    const { error } = await A.from("User").update({ profilePicUrl: newUrl }).eq("id", uA);
    assert(!error, error?.message);

    // Exactly what the DM thread page does: fetch participant User rows fresh.
    const { data: fresh } = await admin.from("User").select("profilePicUrl").eq("id", uA).single();
    assert(fresh.profilePicUrl === newUrl, "fresh read did not reflect the new avatar URL");
  });

  await check("4  a profile update by one user does not affect another user's row", async () => {
    const { data: bob } = await admin.from("User").select("name").eq("id", uB).single();
    assert(bob.name === "Bob PP", "Bob's name changed unexpectedly");
  });

  // ---- password reset, genuinely end to end --------------------------------
  await check("5  full password reset flow: request link -> verify -> set new password -> sign in with it", async () => {
    const newPassword = "Brand-New-Passw0rd!";

    // Equivalent of the user clicking "Forgot password?" and Supabase emailing
    // a link — generateLink produces the same token this app's /auth/callback
    // consumes, without needing a real inbox.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: eB,
    });
    assert(!linkError, linkError?.message);
    const tokenHash = linkData.properties?.hashed_token;
    assert(tokenHash, "generateLink did not return a hashed_token to verify");

    // Equivalent of /auth/callback's verifyOtp branch (type=recovery links use
    // token_hash, same as this app's callback route handles).
    const recoveryClient = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data: verifyData, error: verifyError } = await recoveryClient.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    assert(!verifyError, verifyError?.message);
    assert(verifyData.session, "verifyOtp did not establish a session");

    // Equivalent of the reset-password page's ChangePasswordForm submit.
    const { error: updateError } = await recoveryClient.auth.updateUser({ password: newPassword });
    assert(!updateError, updateError?.message);

    // Prove it actually took effect: old password now fails, new one works.
    const oldPwAttempt = await createClient(URL, ANON, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email: eB, password: pw });
    assert(oldPwAttempt.error, "old password still works after reset");

    const newPwAttempt = await createClient(URL, ANON, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email: eB, password: newPassword });
    assert(!newPwAttempt.error, `sign-in with the new password failed: ${newPwAttempt.error?.message}`);
  });

  await check("6  a used/consumed recovery token cannot be replayed", async () => {
    const { data: linkData } = await admin.auth.admin.generateLink({ type: "recovery", email: eA });
    const tokenHash = linkData.properties?.hashed_token;

    const c1 = createClient(URL, ANON, { auth: { persistSession: false } });
    const first = await c1.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    assert(!first.error, "first use of the token should succeed");

    const c2 = createClient(URL, ANON, { auth: { persistSession: false } });
    const second = await c2.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    assert(second.error, "the same recovery token was accepted twice");
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
