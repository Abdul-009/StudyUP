-- RLS for the read-receipt tables. Run AFTER add_read_receipts.
--
-- MessageRead follows the same model as "Message": RLS stays DISABLED and the
-- server actions in src/app/groups/[groupId]/chat/actions.ts are the trust
-- boundary (they verify group membership before writing).
--
-- DirectMessageRead follows "DirectMessage": RLS is the real boundary, because a
-- read row reveals that a private conversation exists and when it was read.

ALTER TABLE "DirectMessageRead" ENABLE ROW LEVEL SECURITY;

-- Read: either participant of the parent conversation.
CREATE POLICY "Participants can read DM read receipts"
  ON "DirectMessageRead"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "DirectConversation" dc
      WHERE dc."id" = "DirectMessageRead"."conversationId"
        AND (auth.uid()::text = dc."userAId"::text OR auth.uid()::text = dc."userBId"::text)
    )
  );

-- Insert: caller marks only their own read state, and only in a conversation
-- they belong to.
CREATE POLICY "Participants can add own DM read receipts"
  ON "DirectMessageRead"
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = "userId"::text
    AND EXISTS (
      SELECT 1 FROM "DirectConversation" dc
      WHERE dc."id" = "DirectMessageRead"."conversationId"
        AND (auth.uid()::text = dc."userAId"::text OR auth.uid()::text = dc."userBId"::text)
    )
  );

-- Delete: caller can clear only their own read state (mark-as-unread).
CREATE POLICY "Participants can remove own DM read receipts"
  ON "DirectMessageRead"
  FOR DELETE
  USING (auth.uid()::text = "userId"::text);
