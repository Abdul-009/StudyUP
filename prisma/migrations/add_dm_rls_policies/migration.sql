-- RLS Policies for DirectConversation and DirectMessage tables.
-- Run AFTER add_direct_messaging (the tables must already exist).
--
-- NOTE: the rest of the app's tables (Message, Notification, Group, ...) run
-- with RLS disabled and rely on per-server-action auth checks. These two tables
-- are the exception: direct-message content must stay private even if a user
-- calls PostgREST directly with their own JWT, so RLS is the real boundary here.

-- ---------------------------------------------------------------------------
-- DirectConversation
-- ---------------------------------------------------------------------------
ALTER TABLE "DirectConversation" ENABLE ROW LEVEL SECURITY;

-- Read: only the two participants.
CREATE POLICY "Users can read own conversations"
  ON "DirectConversation"
  FOR SELECT
  USING (
    auth.uid()::text = "userAId"::text OR auth.uid()::text = "userBId"::text
  );

-- Create: the caller must be one of the participants AND the two users must
-- already share at least one group. This mirrors the check in
-- getOrCreateDirectConversation() so a direct PostgREST insert can't bypass it.
CREATE POLICY "Users can create conversations with group-mates"
  ON "DirectConversation"
  FOR INSERT
  WITH CHECK (
    (auth.uid()::text = "userAId"::text OR auth.uid()::text = "userBId"::text)
    AND EXISTS (
      SELECT 1
      FROM "GroupMember" ga
      JOIN "GroupMember" gb ON ga."groupId" = gb."groupId"
      WHERE ga."userId" = "DirectConversation"."userAId"
        AND gb."userId" = "DirectConversation"."userBId"
    )
  );

-- Update: participants only (sendDirectMessage bumps createdAt for list sort).
CREATE POLICY "Users can touch own conversations"
  ON "DirectConversation"
  FOR UPDATE
  USING (
    auth.uid()::text = "userAId"::text OR auth.uid()::text = "userBId"::text
  )
  WITH CHECK (
    auth.uid()::text = "userAId"::text OR auth.uid()::text = "userBId"::text
  );

-- ---------------------------------------------------------------------------
-- DirectMessage
-- ---------------------------------------------------------------------------
ALTER TABLE "DirectMessage" ENABLE ROW LEVEL SECURITY;

-- Read: only if the caller is a participant of the parent conversation.
CREATE POLICY "Users can read messages in their conversations"
  ON "DirectMessage"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "DirectConversation" dc
      WHERE dc."id" = "DirectMessage"."conversationId"
      AND (
        auth.uid()::text = dc."userAId"::text OR
        auth.uid()::text = dc."userBId"::text
      )
    )
  );

-- Insert: caller must be the sender AND a participant.
CREATE POLICY "Users can send messages in their conversations"
  ON "DirectMessage"
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = "senderId"::text
    AND EXISTS (
      SELECT 1 FROM "DirectConversation" dc
      WHERE dc."id" = "DirectMessage"."conversationId"
      AND (
        auth.uid()::text = dc."userAId"::text OR
        auth.uid()::text = dc."userBId"::text
      )
    )
  );

-- Update: sender only (soft delete). No DELETE policy => hard delete denied.
CREATE POLICY "Users can update their own messages"
  ON "DirectMessage"
  FOR UPDATE
  USING (auth.uid()::text = "senderId"::text)
  WITH CHECK (auth.uid()::text = "senderId"::text);
