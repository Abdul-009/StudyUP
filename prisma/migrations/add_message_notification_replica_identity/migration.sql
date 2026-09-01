-- OPTIONAL hardening (not required for the features to work).
--
-- The chat and notification-badge clients subscribe to filtered Realtime
-- UPDATE events (groupId=eq / userId=eq). With the default REPLICA IDENTITY,
-- filter matching and RLS checks on UPDATE/DELETE only have the primary key of
-- the OLD row image. In practice postgres_changes still matches these on the
-- NEW image, but under Realtime load or during incidents the events can be
-- dropped. Supabase recommends REPLICA IDENTITY FULL for any published table
-- whose realtime consumers filter or RLS-check UPDATE/DELETE.
--
-- add_directmessage_realtime already sets this for "DirectMessage"; this brings
-- "Message" and "Notification" in line.

ALTER TABLE "Message" REPLICA IDENTITY FULL;
ALTER TABLE "Notification" REPLICA IDENTITY FULL;
