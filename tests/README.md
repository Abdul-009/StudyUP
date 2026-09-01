# Study Up — messaging feature tests

Covers the five recently-added features: message delete, reply-to-message,
private DMs, notification clearing, and the landing page.

## What's automated

`messaging.test.mjs` is a self-contained Node script (no test runner needed). It
drives the **Supabase REST + Realtime APIs directly** with real user sessions, so
it exercises the same trust boundary an attacker would — not just the app UI.

It checks:

| # | Feature | Assertion |
|---|---------|-----------|
| 1 | Delete | sender can soft-delete their own `Message` (row flips `isDeleted`, `content` → NULL) |
| 2 | Delete | **non-sender** `UPDATE` on someone else's `Message` is rejected / affects 0 rows |
| 3 | Delete | realtime `UPDATE` for the soft-delete reaches a second subscribed client |
| 4 | Reply | reply row persists `replyToId`; quote resolves to original + sender |
| 5 | Reply | replying to a soft-deleted message still succeeds |
| 6 | DM | two users sharing a group can create a `DirectConversation` + exchange `DirectMessage`s |
| 7 | DM | two users with **no shared group** cannot create a `DirectConversation` (RLS `WITH CHECK`) |
| 8 | DM | repeat "start conversation" reuses the row (unique `(userAId,userBId)`) — no duplicate |
| 9 | DM | a **non-participant** session reads **0 rows** from the conversation and its messages (RLS `SELECT`) |
| 10 | DM | non-sender cannot soft-delete a DM (RLS `UPDATE`) |
| 11 | DM | realtime delivers a new `DirectMessage` and its delete-state `UPDATE` to the other participant |
| 12 | Notifications | `markAllAsRead`-style bulk `UPDATE` scoped to the caller zeroes their unread rows |
| 13 | Notifications | a fresh `INSERT` after that still leaves an unread row (badge would re-increment) |
| 14 | Notifications | user B cannot flip `isRead` on user A's notification |
| 15 | Notifications | a mark-as-read `UPDATE` reaches the badge's realtime subscription (needs `Notification` `REPLICA IDENTITY FULL`) |

RLS scope decision: **DM tables only** (`add_dm_rls_policies`). With that applied:

- Tests 6–11 (DMs) should pass.
- Tests **2** (non-sender edits a group `Message`) and **14** (user B marks user
  A's `Notification` read) are **expected to FAIL** — `Message` and
  `Notification` deliberately keep app-layer-only enforcement, matching the rest
  of the codebase. Those two failures are the documented finding, not a
  regression. Re-run them as passing only if you later add RLS to those tables.

Note: `anon`/`authenticated` currently hold full CRUD grants on every public
table with RLS off, so before `add_dm_rls_policies` is applied the DM "reject"
tests (7, 9, 10) also fail.

## Prerequisites

1. **Apply the migrations** in `../prisma/migrations/` to the target database:
   - `add_soft_delete_to_messages`
   - `add_reply_to_messages`
   - `add_readAt_to_notifications`
   - `add_direct_messaging`
   - `add_dm_rls_policies`
   - `add_directmessage_realtime`
   - `add_message_notification_replica_identity` (optional hardening)
2. `.env.local` must have `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Run against a **staging / disposable project**, not production — the script
   creates users (`studyup-test+*@example.com`), a group, messages and DMs, then
   deletes them in a `finally` block.

## Run

```bash
node tests/messaging.test.mjs
```

Exit code is non-zero if any assertion fails.

## Manual UI checklist (needs two browsers / an incognito window)

Landing page:
- [ ] Signed out, visiting `/` shows the marketing page (hero, features, footer).
- [ ] Signed in, visiting `/` server-redirects to `/home` (no landing flash).
- [ ] Header "Log In" → `/login`, "Sign Up" / "Get Started Free" / "Create Your First Group" → `/signup`.
- [ ] "See How It Works" scrolls to the How-It-Works section.
- [ ] At 375 px width nothing overflows horizontally; nav + grids collapse to one column.

Delete / reply (group chat, two accounts in the same group):
- [ ] Hover a message → Reply + (own only) Trash controls appear.
- [ ] Delete own message → it becomes "This message was deleted" in both windows without refresh.
- [ ] A reply whose original was deleted shows "Original message was deleted" in the quote — live, no refresh.
- [ ] Tapping a quote smooth-scrolls to and briefly rings the original.
- [ ] Reply preview + sent reply show the right name and quoted text immediately (not "Unknown").

DMs:
- [ ] Group chat → member list → "Message" opens a thread; tapping "Message" again returns to the same thread (no dup in `/messages`).
- [ ] "Message" on a user who shares no group surfaces the "only message users who share a group" notice.
- [ ] Reply + delete inside the DM thread behave exactly as in group chat, live in both windows.

Notifications:
- [ ] With unread items, "Mark all as read" empties the list and the sidebar badge disappears immediately.
- [ ] Triggering a new notification afterwards re-shows the badge without a refresh.
