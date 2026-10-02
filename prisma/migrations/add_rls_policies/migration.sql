-- Row Level Security for every public table that did not have it.
--
-- Before this, RLS was off on 14 tables, so anyone holding the public anon key
-- could read or modify all users, groups, messages and notifications over the
-- REST API without even signing in. Policies below give signed-in users
-- exactly the access the app already uses and nothing more.
--
-- The app talks to Postgres as the signed-in user (anon key + session), except
-- for the cron job, push delivery, avatar/file storage uploads, which use the
-- service role and bypass RLS.
--
-- Idempotent: functions use CREATE OR REPLACE, policies are dropped first.
-- Hand-authored like the other migrations in this folder.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions. SECURITY DEFINER so they can read GroupMember without
-- re-triggering GroupMember's own policies (which would recurse forever).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "GroupMember" WHERE "groupId" = gid AND "userId" = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(gid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "GroupMember"
    WHERE "groupId" = gid AND "userId" = (SELECT auth.uid()) AND role = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.group_member_count(gid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM "GroupMember" WHERE "groupId" = gid;
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "GroupMember" me
    JOIN "GroupMember" them ON them."groupId" = me."groupId"
    WHERE me."userId" = (SELECT auth.uid()) AND them."userId" = uid
  );
$$;

CREATE OR REPLACE FUNCTION public.has_dm_with(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "DirectConversation" dc
    WHERE (dc."userAId" = (SELECT auth.uid()) AND dc."userBId" = uid)
       OR (dc."userBId" = (SELECT auth.uid()) AND dc."userAId" = uid)
  );
$$;

-- Is the caller a participant of this conversation, and is `uid` the other one
-- (or the caller)? Used to let a sender write the recipient's DM notification.
CREATE OR REPLACE FUNCTION public.dm_notification_allowed(conversation text, recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "DirectConversation" dc
    WHERE dc.id::text = conversation
      AND (SELECT auth.uid()) IN (dc."userAId", dc."userBId")
      AND recipient IN (dc."userAId", dc."userBId")
  );
$$;

CREATE OR REPLACE FUNCTION public.poll_group_id(pid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "groupId" FROM "Poll" WHERE id = pid;
$$;

CREATE OR REPLACE FUNCTION public.option_group_id(oid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p."groupId" FROM "PollOption" o JOIN "Poll" p ON p.id = o."pollId" WHERE o.id = oid;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Joining a private group by invite code. The caller can't see the group (it
-- is private) so the lookup and the membership insert happen server-side.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.join_group_with_code(code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gid uuid;
  uid uuid := (SELECT auth.uid());
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to join a group.';
  END IF;

  SELECT id INTO gid FROM "Group"
  WHERE "inviteCode" IS NOT NULL AND "inviteCode" = upper(btrim(code))
  LIMIT 1;

  IF gid IS NULL THEN
    RAISE EXCEPTION 'No group matches that invite code.';
  END IF;

  INSERT INTO "GroupMember" ("groupId", "userId", role)
  VALUES (gid, uid, 'MEMBER')
  ON CONFLICT ("groupId", "userId") DO NOTHING;

  RETURN gid;
END;
$$;

-- Role changes are admin-only even though members may update their own row
-- (lastSeenAt). Policies can't restrict by column, so a trigger does.
CREATE OR REPLACE FUNCTION public.guard_group_member_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW."groupId" <> OLD."groupId" OR NEW."userId" <> OLD."userId" THEN
    RAISE EXCEPTION 'Membership rows cannot be moved.';
  END IF;
  IF auth.uid() IS NOT NULL AND NEW.role <> OLD.role AND NOT public.is_group_admin(OLD."groupId") THEN
    RAISE EXCEPTION 'Only admins can change roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_group_member_update ON "GroupMember";
CREATE TRIGGER guard_group_member_update
  BEFORE UPDATE ON "GroupMember"
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_member_update();

-- Helper/RPC execution: signed-in users only (policies call these as the caller).
REVOKE ALL ON FUNCTION
  public.is_group_member(uuid), public.is_group_admin(uuid), public.group_member_count(uuid),
  public.shares_group_with(uuid), public.has_dm_with(uuid),
  public.dm_notification_allowed(text, uuid), public.poll_group_id(uuid),
  public.option_group_id(uuid), public.join_group_with_code(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.is_group_member(uuid), public.is_group_admin(uuid), public.group_member_count(uuid),
  public.shares_group_with(uuid), public.has_dm_with(uuid),
  public.dm_notification_allowed(text, uuid), public.poll_group_id(uuid),
  public.option_group_id(uuid), public.join_group_with_code(text)
  TO authenticated;

-- The signup trigger keeps working without being callable over the API.
ALTER FUNCTION public.handle_new_auth_user() SET search_path = public;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Policies. All `TO authenticated`: signed-out requests get nothing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_select" ON "User";
DROP POLICY IF EXISTS "user_update_self" ON "User";
CREATE POLICY "user_select" ON "User" FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.shares_group_with(id) OR public.has_dm_with(id));
CREATE POLICY "user_update_self" ON "User" FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

ALTER TABLE "Group" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_select" ON "Group";
DROP POLICY IF EXISTS "group_insert" ON "Group";
DROP POLICY IF EXISTS "group_update" ON "Group";
DROP POLICY IF EXISTS "group_delete" ON "Group";
CREATE POLICY "group_select" ON "Group" FOR SELECT TO authenticated
  USING ("isPrivate" = false OR "createdBy" = (SELECT auth.uid()) OR public.is_group_member(id));
CREATE POLICY "group_insert" ON "Group" FOR INSERT TO authenticated
  WITH CHECK ("createdBy" = (SELECT auth.uid()));
CREATE POLICY "group_update" ON "Group" FOR UPDATE TO authenticated
  USING (public.is_group_admin(id)) WITH CHECK (public.is_group_admin(id));
CREATE POLICY "group_delete" ON "Group" FOR DELETE TO authenticated
  USING (public.is_group_admin(id) OR (public.is_group_member(id) AND public.group_member_count(id) = 1));

ALTER TABLE "GroupMember" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groupmember_select" ON "GroupMember";
DROP POLICY IF EXISTS "groupmember_insert_creator" ON "GroupMember";
DROP POLICY IF EXISTS "groupmember_insert_public" ON "GroupMember";
DROP POLICY IF EXISTS "groupmember_update" ON "GroupMember";
DROP POLICY IF EXISTS "groupmember_delete" ON "GroupMember";
CREATE POLICY "groupmember_select" ON "GroupMember" FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()) OR public.is_group_member("groupId"));
-- The creator seeds their own brand-new (still empty) group as its admin.
CREATE POLICY "groupmember_insert_creator" ON "GroupMember" FOR INSERT TO authenticated
  WITH CHECK (
    "userId" = (SELECT auth.uid()) AND role = 'ADMIN'
    AND public.group_member_count("groupId") = 0
    AND EXISTS (SELECT 1 FROM "Group" g WHERE g.id = "groupId" AND g."createdBy" = (SELECT auth.uid()))
  );
-- Anyone may join a public group. Private groups only via join_group_with_code().
CREATE POLICY "groupmember_insert_public" ON "GroupMember" FOR INSERT TO authenticated
  WITH CHECK (
    "userId" = (SELECT auth.uid()) AND role = 'MEMBER'
    AND EXISTS (SELECT 1 FROM "Group" g WHERE g.id = "groupId" AND g."isPrivate" = false)
  );
CREATE POLICY "groupmember_update" ON "GroupMember" FOR UPDATE TO authenticated
  USING ("userId" = (SELECT auth.uid()) OR public.is_group_admin("groupId"))
  WITH CHECK ("userId" = (SELECT auth.uid()) OR public.is_group_admin("groupId"));
CREATE POLICY "groupmember_delete" ON "GroupMember" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()) OR public.is_group_admin("groupId"));

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_select" ON "Message";
DROP POLICY IF EXISTS "message_insert" ON "Message";
DROP POLICY IF EXISTS "message_update_own" ON "Message";
CREATE POLICY "message_select" ON "Message" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "message_insert" ON "Message" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));
CREATE POLICY "message_update_own" ON "Message" FOR UPDATE TO authenticated
  USING ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"))
  WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));

ALTER TABLE "MessageRead" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messageread_select" ON "MessageRead";
DROP POLICY IF EXISTS "messageread_insert" ON "MessageRead";
DROP POLICY IF EXISTS "messageread_update" ON "MessageRead";
DROP POLICY IF EXISTS "messageread_delete" ON "MessageRead";
CREATE POLICY "messageread_select" ON "MessageRead" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "messageread_insert" ON "MessageRead" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));
CREATE POLICY "messageread_update" ON "MessageRead" FOR UPDATE TO authenticated
  USING ("userId" = (SELECT auth.uid())) WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));
CREATE POLICY "messageread_delete" ON "MessageRead" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_select_own" ON "Notification";
DROP POLICY IF EXISTS "notification_select" ON "Notification";
DROP POLICY IF EXISTS "notification_insert" ON "Notification";
DROP POLICY IF EXISTS "notification_update" ON "Notification";
DROP POLICY IF EXISTS "notification_delete_own" ON "Notification";
-- Own notifications, plus DM notifications of a conversation the caller is in.
-- The second part is needed because Postgres also applies the SELECT policy to
-- rows an UPDATE ... WHERE touches, so without it a DM sender could never
-- refresh the recipient's unread DM notification. App queries always filter
-- by userId, so these rows never show up in anyone else's bell.
CREATE POLICY "notification_select" ON "Notification" FOR SELECT TO authenticated
  USING (
    "userId" = (SELECT auth.uid())
    OR ("groupId" IS NULL AND type = 'NEW_MESSAGE' AND public.dm_notification_allowed("refId", "userId"))
  );
-- Senders create notifications for other people: only for members of a group
-- they are in, or for the other side of a DM they are part of.
CREATE POLICY "notification_insert" ON "Notification" FOR INSERT TO authenticated
  WITH CHECK (
    ("groupId" IS NOT NULL AND public.is_group_member("groupId") AND EXISTS (
      SELECT 1 FROM "GroupMember" gm WHERE gm."groupId" = "Notification"."groupId" AND gm."userId" = "Notification"."userId"))
    OR ("groupId" IS NULL AND type = 'NEW_MESSAGE' AND public.dm_notification_allowed("refId", "userId"))
  );
-- Own notifications (mark read), plus a DM sender refreshing the unread DM
-- notification they already created for the other participant.
CREATE POLICY "notification_update" ON "Notification" FOR UPDATE TO authenticated
  USING (
    "userId" = (SELECT auth.uid())
    OR ("groupId" IS NULL AND type = 'NEW_MESSAGE' AND public.dm_notification_allowed("refId", "userId"))
  )
  WITH CHECK (
    "userId" = (SELECT auth.uid())
    OR ("groupId" IS NULL AND type = 'NEW_MESSAGE' AND public.dm_notification_allowed("refId", "userId"))
  );
CREATE POLICY "notification_delete_own" ON "Notification" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifpref_select" ON "NotificationPreference";
DROP POLICY IF EXISTS "notifpref_insert_own" ON "NotificationPreference";
DROP POLICY IF EXISTS "notifpref_update_own" ON "NotificationPreference";
DROP POLICY IF EXISTS "notifpref_delete_own" ON "NotificationPreference";
-- Senders read recipients' opt-outs to decide whether to notify them.
CREATE POLICY "notifpref_select" ON "NotificationPreference" FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()) OR public.shares_group_with("userId") OR public.has_dm_with("userId"));
CREATE POLICY "notifpref_insert_own" ON "NotificationPreference" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()));
CREATE POLICY "notifpref_update_own" ON "NotificationPreference" FOR UPDATE TO authenticated
  USING ("userId" = (SELECT auth.uid())) WITH CHECK ("userId" = (SELECT auth.uid()));
CREATE POLICY "notifpref_delete_own" ON "NotificationPreference" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcement_select" ON "Announcement";
DROP POLICY IF EXISTS "announcement_insert_admin" ON "Announcement";
CREATE POLICY "announcement_select" ON "Announcement" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "announcement_insert_admin" ON "Announcement" FOR INSERT TO authenticated
  WITH CHECK ("postedBy" = (SELECT auth.uid()) AND public.is_group_admin("groupId"));

ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assignment_select" ON "Assignment";
DROP POLICY IF EXISTS "assignment_insert" ON "Assignment";
CREATE POLICY "assignment_select" ON "Assignment" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "assignment_insert" ON "Assignment" FOR INSERT TO authenticated
  WITH CHECK ("createdBy" = (SELECT auth.uid()) AND public.is_group_member("groupId"));

ALTER TABLE "AssignmentCompletion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "completion_select" ON "AssignmentCompletion";
DROP POLICY IF EXISTS "completion_insert" ON "AssignmentCompletion";
DROP POLICY IF EXISTS "completion_update" ON "AssignmentCompletion";
DROP POLICY IF EXISTS "completion_delete" ON "AssignmentCompletion";
CREATE POLICY "completion_select" ON "AssignmentCompletion" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "completion_insert" ON "AssignmentCompletion" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));
CREATE POLICY "completion_update" ON "AssignmentCompletion" FOR UPDATE TO authenticated
  USING ("userId" = (SELECT auth.uid())) WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member("groupId"));
CREATE POLICY "completion_delete" ON "AssignmentCompletion" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE "Poll" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "poll_select" ON "Poll";
DROP POLICY IF EXISTS "poll_insert" ON "Poll";
CREATE POLICY "poll_select" ON "Poll" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "poll_insert" ON "Poll" FOR INSERT TO authenticated
  WITH CHECK ("createdBy" = (SELECT auth.uid()) AND public.is_group_member("groupId"));

ALTER TABLE "PollOption" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "polloption_select" ON "PollOption";
DROP POLICY IF EXISTS "polloption_insert" ON "PollOption";
CREATE POLICY "polloption_select" ON "PollOption" FOR SELECT TO authenticated
  USING (public.is_group_member(public.poll_group_id("pollId")));
CREATE POLICY "polloption_insert" ON "PollOption" FOR INSERT TO authenticated
  WITH CHECK (public.is_group_member(public.poll_group_id("pollId")));

ALTER TABLE "PollVote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pollvote_select" ON "PollVote";
DROP POLICY IF EXISTS "pollvote_insert" ON "PollVote";
DROP POLICY IF EXISTS "pollvote_delete_own" ON "PollVote";
CREATE POLICY "pollvote_select" ON "PollVote" FOR SELECT TO authenticated
  USING (public.is_group_member(public.option_group_id("pollOptionId")));
CREATE POLICY "pollvote_insert" ON "PollVote" FOR INSERT TO authenticated
  WITH CHECK ("userId" = (SELECT auth.uid()) AND public.is_group_member(public.option_group_id("pollOptionId")));
CREATE POLICY "pollvote_delete_own" ON "PollVote" FOR DELETE TO authenticated
  USING ("userId" = (SELECT auth.uid()));

ALTER TABLE "SharedFile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sharedfile_select" ON "SharedFile";
DROP POLICY IF EXISTS "sharedfile_insert" ON "SharedFile";
CREATE POLICY "sharedfile_select" ON "SharedFile" FOR SELECT TO authenticated
  USING (public.is_group_member("groupId"));
CREATE POLICY "sharedfile_insert" ON "SharedFile" FOR INSERT TO authenticated
  WITH CHECK ("uploadedBy" = (SELECT auth.uid()) AND public.is_group_member("groupId"));

-- Signed-out API access to the data tables is not needed anywhere in the app.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
