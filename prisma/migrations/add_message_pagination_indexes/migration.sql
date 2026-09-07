-- Cursor-based message pagination (GroupChatClient / DMThread + the
-- fetchGroupMessages / fetchDirectMessages actions) walks history newest-first,
-- one page at a time, ordered by (createdAt DESC, id DESC) and filtered to rows
-- older than a cursor. These composite indexes keep each page a range scan
-- instead of a full-table sort as a thread grows.
--
-- Idempotent — safe to re-run alongside the other hand-applied migrations.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_groupId_createdAt_idx"
  ON "Message" ("groupId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DirectMessage_conversationId_createdAt_idx"
  ON "DirectMessage" ("conversationId", "createdAt");
