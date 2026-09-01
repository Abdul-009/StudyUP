-- Realtime wiring for direct messages.
-- Run AFTER add_direct_messaging and add_dm_rls_policies.
--
-- The DMThread client subscribes to postgres_changes on "DirectMessage" for
-- both INSERT (new DMs) and UPDATE (soft-delete state). Without the table in
-- the supabase_realtime publication no events are delivered and the thread
-- only updates on a manual refresh.
--
-- This is the SQL equivalent of ticking "DirectMessage" under
-- Database -> Replication -> supabase_realtime in the Supabase dashboard.

ALTER PUBLICATION supabase_realtime ADD TABLE "DirectMessage";

-- REPLICA IDENTITY FULL so Realtime can evaluate the RLS SELECT policy against
-- UPDATE/DELETE events (needs the row's conversationId, not just the PK).
ALTER TABLE "DirectMessage" REPLICA IDENTITY FULL;
