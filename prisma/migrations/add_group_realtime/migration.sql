-- Realtime wiring for group metadata edits (name/description/accentColor).
-- GroupChatClient subscribes to postgres_changes UPDATE on "Group" filtered
-- by id=eq.<groupId> so an edit in Settings shows up live for anyone with
-- that group's chat open, instead of only after their next navigation.
--
-- The filter is on the primary key, so the default REPLICA IDENTITY (which
-- always carries the PK) is sufficient here - unlike Message/Notification,
-- which filter on a non-PK column and needed REPLICA IDENTITY FULL.

ALTER PUBLICATION supabase_realtime ADD TABLE "Group";
