/**
 * Study Up: UI smoke test at desktop and phone sizes.
 *
 * Creates two throwaway users, a few groups and messages (service role), logs
 * in through the real login form, then checks layout and interactions in a real
 * browser: composer stays on screen, no horizontal overflow, no dead space under
 * the composer, group colours are distinct, tap/hover message actions, sending,
 * editing, video rendering, DM list/back button. Everything it creates is
 * deleted at the end.
 *
 *   npm run dev        (in another terminal)
 *   node tests/ui-smoke.mjs
 *
 * Screenshots go to SHOTS_DIR (default: ./tests/.shots).
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR || resolve(root, "tests/.shots");
mkdirSync(SHOTS, { recursive: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TAG = "studyup-ui-smoke";
const pw = "Test-passw0rd!";
const stamp = Date.now();
const emailA = `${TAG}+a-${stamp}@example.com`;
const emailB = `${TAG}+b-${stamp}@example.com`;

const created = { users: [], groups: [], conversations: [] };
const results = [];
function record(ok, name, detail = "") {
  results.push({ ok, name, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ↳ " + detail : ""}`);
}

async function mkUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  created.users.push(data.user.id);
  await admin.from("User").update({ name }).eq("id", data.user.id);
  return data.user.id;
}

async function seed() {
  const a = await mkUser(emailA, "Smoke Alice");
  const b = await mkUser(emailB, "Smoke Bob");

  // Several groups that all hold the OLD green accent, to prove they now render in different colours.
  const legacy = ["#1AA76B", "#4E9270", "#8A9A2E", "#159C8C", "#2F6B4C"];
  const groupIds = [];
  for (let i = 0; i < 5; i++) {
    const { data: g, error } = await admin
      .from("Group")
      .insert({ name: `${TAG} group ${i + 1}`, createdBy: a, accentColor: legacy[i] })
      .select("id")
      .single();
    if (error) throw error;
    groupIds.push(g.id);
    created.groups.push(g.id);
    await admin.from("GroupMember").insert([
      { groupId: g.id, userId: a, role: "ADMIN" },
      { groupId: g.id, userId: b, role: "MEMBER" },
    ]);
  }

  const main = groupIds[0];
  const rows = [];
  for (let i = 0; i < 30; i++) {
    rows.push({
      groupId: main,
      userId: i % 3 === 0 ? b : a,
      content: `Message number ${i + 1} ${"lorem ipsum ".repeat(i % 5)}`,
      createdAt: new Date(Date.now() - (60 - i) * 60_000).toISOString(),
      attachmentUrl: null,
      attachmentType: null,
      attachmentName: null,
      attachmentSize: null,
    });
  }
  rows.push({
    groupId: main,
    userId: b,
    content: null,
    attachmentUrl: "https://example.com/sample.mp4",
    attachmentType: "video/mp4",
    attachmentName: "sample.mp4",
    attachmentSize: 1_500_000,
    createdAt: new Date().toISOString(),
  });
  const { error: seedError } = await admin.from("Message").insert(rows);
  if (seedError) throw new Error("seeding messages failed: " + seedError.message);

  const [x, y] = [a, b].sort();
  const { data: conv } = await admin.from("DirectConversation").insert({ userAId: x, userBId: y }).select("id").single();
  created.conversations.push(conv.id);
  await admin.from("DirectMessage").insert([
    { conversationId: conv.id, senderId: b, content: "Hey Alice, DM preview text" },
    { conversationId: conv.id, senderId: a, content: "Hi Bob" },
  ]);

  return { a, b, main, conv: conv.id };
}

async function cleanup() {
  for (const id of created.conversations) await admin.from("DirectConversation").delete().eq("id", id);
  for (const id of created.groups) await admin.from("Group").delete().eq("id", id);
  for (const id of created.users) {
    await admin.from("Notification").delete().eq("userId", id);
    await admin.auth.admin.deleteUser(id);
    await admin.from("User").delete().eq("id", id);
  }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // Controlled inputs: filling before React hydrates gets wiped on hydration.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('input[type="email"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    null,
    { timeout: 60_000 },
  );
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  try {
    // First hit of each route compiles on demand under `next dev`, so be generous.
    await page.waitForURL("**/home", { timeout: 120_000 });
  } catch (err) {
    await page.screenshot({ path: `${SHOTS}/login-failure.png` });
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 400).replace(/\s+/g, " ");
    throw new Error(`login did not reach /home (url=${page.url()}): ${body}`, { cause: err });
  }
}

async function runViewport(browser, label, contextOptions, ids) {
  console.log(`\n=== ${label} ===`);
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  const isMobile = !!contextOptions.isMobile;

  // Three unread notifications for Alice: two group messages + one DM.
  await admin.from("Notification").delete().eq("userId", ids.a);
  const { error: notifError } = await admin.from("Notification").insert([
    { userId: ids.a, type: "NEW_MESSAGE", groupId: ids.main, content: "g1" },
    { userId: ids.a, type: "NEW_MESSAGE", groupId: ids.main, content: "g2" },
    { userId: ids.a, type: "NEW_MESSAGE", groupId: null, refId: ids.conv, content: "dm" },
  ]);
  if (notifError) throw new Error("seeding notifications failed: " + notifError.message);

  await login(page, emailA);
  await page.screenshot({ path: `${SHOTS}/${label}-home.png` });

  const bell = isMobile ? page.locator('header a[aria-label="Notifications"]') : page.locator('aside a[href="/notifications"]');
  const dmTab = isMobile ? page.locator('nav a[aria-label="Messages"]') : page.locator('aside a[href="/messages"]');
  const hasCount = async (loc, n) => (await loc.innerText().catch(() => "")).includes(String(n));
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1500);
  record(await hasCount(bell, 3), `${label}: bell shows 3 unread`, (await bell.innerText()).replace(/\s+/g, " "));
  record(await hasCount(dmTab, 1), `${label}: Messages tab shows 1 unread DM`, (await dmTab.innerText()).replace(/\s+/g, " "));

  await page.goto(`${BASE}/notifications`, { waitUntil: "domcontentloaded" });
  const clearBtn = page.getByRole("button", { name: "Clear all" });
  await clearBtn.waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/${label}-notifications.png` });
  page.once("dialog", (d) => d.accept());
  await clearBtn.click();
  const cleared = await page
    .waitForFunction(
      (mobile) => {
        const el = mobile
          ? document.querySelector('header a[aria-label="Notifications"]')
          : document.querySelector('aside a[href="/notifications"]');
        return !!el && !/\d/.test(el.textContent || "");
      },
      isMobile,
      { timeout: 8_000 },
    )
    .then(() => true, () => false);
  record(cleared, `${label}: after "Clear all" the unread badge disappears without a reload`);
  const emptyShown = await page.getByText("Nothing here yet").waitFor({ timeout: 8_000 }).then(() => true, () => false);
  if (!emptyShown) await page.screenshot({ path: `${SHOTS}/${label}-notifications-after-clear.png` });
  record(emptyShown, `${label}: notifications page shows the empty state`);

  // settings: preferences give feedback
  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Save preferences" }).click();
  record(await page.getByText("Saved", { exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false), `${label}: saving notification preferences shows "Saved"`);

  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(hOverflow <= 1, `${label}: /home has no horizontal overflow`, `overflow=${hOverflow}px`);

  // ---- group chat ----
  await page.goto(`${BASE}/groups/${ids.main}/chat`, { waitUntil: "domcontentloaded" });
  const composer = page.locator("form textarea");
  await composer.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/${label}-chat.png` });

  record((await page.title()).startsWith("Group chat"), `${label}: tab title names the page`, await page.title());
  const vh = page.viewportSize().height;
  const box = await composer.boundingBox();
  record(!!box && box.y + box.height <= vh, `${label}: composer is visible without scrolling the page`, `bottom=${Math.round((box?.y ?? 0) + (box?.height ?? 0))} of ${vh}`);

  const chatOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(chatOverflow <= 1, `${label}: chat has no horizontal overflow`, `overflow=${chatOverflow}px`);

  const pageScroll = await page.evaluate(() => {
    const el = document.querySelector("body > div:last-child > div:last-child, body > div > div.overflow-y-auto");
    return el ? el.scrollHeight - el.clientHeight : -1;
  });
  record(pageScroll <= 2, `${label}: chat does not make the whole page scroll`, `extra=${pageScroll}px`);

  const gap = await page.evaluate(() => {
    const ta = document.querySelector('textarea[placeholder="Write a message"]');
    const section = ta?.closest("section");
    if (!ta || !section) return -1;
    return Math.round(section.getBoundingClientRect().bottom - ta.getBoundingClientRect().bottom);
  });
  record(gap >= 0 && gap < 60, `${label}: no dead space under the composer`, `gap=${gap}px`);

  const list = await page.evaluate(() => {
    const el = document.querySelector("section .overflow-y-auto");
    return el ? { scrollable: el.scrollHeight > el.clientHeight, atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 40 } : null;
  });
  record(!!list?.scrollable && !!list?.atBottom, `${label}: message list scrolls internally and starts at the newest message`, JSON.stringify(list));

  const videoCount = await page.locator("video").count();
  record(videoCount >= 1, `${label}: video attachment renders a <video> player`, `videos=${videoCount}`);

  // distinct group colours (desktop shows the group list)
  if (!isMobile) {
    const colors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("aside a span.rounded-full")).map((el) => getComputedStyle(el).backgroundColor),
    );
    const distinct = new Set(colors).size;
    record(colors.length >= 5 && distinct >= 4, `${label}: groups show distinct colours`, `${distinct} distinct of ${colors.length}`);
  }

  // send a message
  const text = `smoke ${label} ${Date.now()}`;
  await composer.fill(text);
  await composer.press("Enter");
  await page.getByText(text).first().waitFor({ timeout: 15_000 }).then(
    () => record(true, `${label}: sending a message shows it in the thread`),
    () => record(false, `${label}: sending a message shows it in the thread`, "did not appear"),
  );

  // message actions: hover (desktop) or tap (phone)
  const own = page.getByText(text).first();
  if (isMobile) await own.tap();
  else await own.hover();
  const editBtn = page.getByRole("button", { name: "Edit message" }).last();
  const editVisible = await editBtn.isVisible().catch(() => false);
  record(editVisible, `${label}: ${isMobile ? "tapping" : "hovering"} your message reveals Edit`);

  if (editVisible) {
    await editBtn.click();
    const prefilled = await composer.inputValue();
    record(prefilled === text, `${label}: Edit loads the message into the composer`, `value="${prefilled.slice(0, 30)}"`);
    await composer.press("Escape");
    const cleared = (await composer.inputValue()) === "";
    record(cleared, `${label}: Escape cancels the edit`);

    // actually edit
    if (isMobile) await own.tap();
    else await own.hover();
    await page.getByRole("button", { name: "Edit message" }).last().click();
    await composer.fill(`${text} (edited)`);
    await composer.press("Enter");
    await page.getByText("(edited)").first().waitFor({ timeout: 15_000 }).then(
      () => record(true, `${label}: saving an edit updates the message`),
      () => record(false, `${label}: saving an edit updates the message`, "no (edited) marker"),
    );
  }
  await page.screenshot({ path: `${SHOTS}/${label}-chat-after.png` });

  // other group pages
  for (const seg of ["announcements", "assignments", "polls", "files", "settings"]) {
    await page.goto(`${BASE}/groups/${ids.main}/${seg}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record(ov <= 1, `${label}: /${seg} has no horizontal overflow`, `overflow=${ov}px`);
    if (seg === "polls") await page.screenshot({ path: `${SHOTS}/${label}-polls.png` });
  }

  // poll modal: add/remove option buttons
  await page.goto(`${BASE}/groups/${ids.main}/polls`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /New poll/ }).click();
  const optInputs = () => page.locator('input[name^="option-"]').count();
  const startCount = await optInputs();
  await page.getByRole("button", { name: /Add option/ }).click();
  const afterAdd = await optInputs();
  await page.getByRole("button", { name: /Remove option 3/ }).click();
  const afterRemove = await optInputs();
  record(startCount === 2 && afterAdd === 3 && afterRemove === 2, `${label}: poll options start at 2, can add and remove`, `${startCount}→${afterAdd}→${afterRemove}`);
  await page.screenshot({ path: `${SHOTS}/${label}-poll-modal.png` });

  // ---- DMs ----
  await page.goto(`${BASE}/messages`, { waitUntil: "domcontentloaded" });
  const preview = page.getByText("Hey Alice, DM preview text");
  await preview.waitFor({ timeout: 15_000 }).then(
    () => record(true, `${label}: Messages list shows the last-message preview`),
    () => record(false, `${label}: Messages list shows the last-message preview`),
  );
  await page.screenshot({ path: `${SHOTS}/${label}-messages.png` });

  // starting a conversation from the Messages page
  await page.getByRole("button", { name: /New message/ }).click();
  const dialog = page.getByRole("dialog");
  const listed = await dialog.getByText("Smoke Bob").waitFor({ timeout: 8_000 }).then(() => true, () => false);
  record(listed, `${label}: "New message" lists people you share a group with`);
  await page.screenshot({ path: `${SHOTS}/${label}-new-message.png` });
  if (listed) {
    await dialog.getByText("Smoke Bob").click();
    await page.waitForURL(new RegExp("/messages/[0-9a-f-]{36}"), { timeout: 60_000 }).then(
      () => record(true, `${label}: choosing a person opens the conversation`),
      () => record(false, `${label}: choosing a person opens the conversation`, page.url()),
    );
  }
  await page.goto(`${BASE}/messages/${ids.conv}`, { waitUntil: "domcontentloaded" });
  const dmComposer = page.locator("form textarea");
  await dmComposer.waitFor({ timeout: 30_000 });
  const dmBox = await dmComposer.boundingBox();
  record(!!dmBox && dmBox.y + dmBox.height <= vh, `${label}: DM composer is visible without scrolling`, `bottom=${Math.round((dmBox?.y ?? 0) + (dmBox?.height ?? 0))} of ${vh}`);
  if (isMobile) {
    const back = await page.getByRole("link", { name: "Back to messages" }).isVisible().catch(() => false);
    record(back, `${label}: DM thread has a back button`);
  }
  await page.screenshot({ path: `${SHOTS}/${label}-dm.png` });

  record(consoleErrors.length === 0, `${label}: no uncaught page errors`, consoleErrors.slice(0, 2).join(" | "));
  await context.close();
}

let exitCode = 0;
try {
  const ids = await seed();
  const browser = await chromium.launch();
  await runViewport(browser, "desktop", { viewport: { width: 1440, height: 900 } }, ids);
  await runViewport(
    browser,
    "mobile",
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    ids,
  );
  console.log("\n=== login return path ===");
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/groups/${ids.main}/chat`, { waitUntil: "domcontentloaded" });
  await anonPage.waitForURL("**/login**", { timeout: 60_000 });
  record(anonPage.url().includes("next="), "signed-out visit to a group page is sent to /login with ?next=", anonPage.url());
  await anonPage.waitForFunction(
    () => {
      const el = document.querySelector('input[type="email"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    null,
    { timeout: 60_000 },
  );
  await anonPage.fill('input[type="email"]', emailA);
  await anonPage.fill('input[type="password"]', pw);
  await anonPage.click('button[type="submit"]');
  await anonPage.waitForURL(`**/groups/${ids.main}/chat`, { timeout: 120_000 }).then(
    () => record(true, "after signing in you land back on the page you wanted"),
    () => record(false, "after signing in you land back on the page you wanted", anonPage.url()),
  );
  await anon.close();
  await browser.close();
} catch (err) {
  console.error("\nTest run crashed:", err);
  exitCode = 1;
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: ${SHOTS}`);
process.exit(exitCode || (failed ? 1 : 0));
