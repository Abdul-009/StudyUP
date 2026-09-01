-- Realtime wiring for read receipts. Run AFTER add_read_receipts (+ _rls).
--
-- GroupChatClient / DMThread subscribe to postgres_changes on these tables for
-- INSERT (someone read a message) and DELETE (someone marked it unread), so the
-- "Seen" line and the unread dots update live. Without the tables in the
-- supabase_realtime publication no events are delivered.
--
-- SQL equivalent of ticking the tables under
-- Database -> Replication -> supabase_realtime in the Supabase dashboard.

ALTER PUBLICATION supabase_realtime ADD TABLE "MessageRead";
ALTER PUBLICATION supabase_realtime ADD TABLE "DirectMessageRead";

-- REPLICA IDENTITY FULL so Realtime has the whole OLD row on DELETE - the
-- clients filter by groupId / conversationId and DirectMessageRead is RLS-checked
-- on delete, both of which need columns beyond the primary key.
ALTER TABLE "MessageRead" REPLICA IDENTITY FULL;
ALTER TABLE "DirectMessageRead" REPLICA IDENTITY FULL;
