-- Run AFTER add_assignment_reminder_notif_type (this migration's partial
-- index below references that enum value, which must already be committed).

-- A NULL completedAt meant "not completed" under the old toggle semantics
-- (upsert-with-null instead of delete). Under the new schema the row's
-- existence IS the completion signal, so these rows are equivalent to no
-- row at all.
DELETE FROM "AssignmentCompletion" WHERE "completedAt" IS NULL;

-- AlterTable
ALTER TABLE "AssignmentCompletion"
  ADD COLUMN "groupId" UUID,
  ALTER COLUMN "completedAt" SET NOT NULL,
  ALTER COLUMN "completedAt" SET DEFAULT now();

-- Backfill groupId (denormalized from Assignment, same pattern as
-- MessageRead.groupId / DirectMessageRead.conversationId) for any
-- pre-existing completion rows.
UPDATE "AssignmentCompletion" ac
SET "groupId" = a."groupId"
FROM "Assignment" a
WHERE a."id" = ac."assignmentId";

ALTER TABLE "AssignmentCompletion" ALTER COLUMN "groupId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AssignmentCompletion_groupId_idx" ON "AssignmentCompletion"("groupId");

-- Realtime wiring so the assignments list updates live when any member
-- toggles their completion — see add_directmessage_realtime for the same
-- pattern/rationale.
ALTER PUBLICATION supabase_realtime ADD TABLE "AssignmentCompletion";
ALTER TABLE "AssignmentCompletion" REPLICA IDENTITY FULL;

-- Dedup guard for due-date reminders (the cron job at
-- /api/cron/assignment-reminders). A partial unique index rather than an
-- app-level "check then insert" - that has a TOCTOU race between two
-- overlapping cron runs, this doesn't: a second insert attempt for the same
-- (userId, refId) reminder simply violates the constraint, so at most one
-- ASSIGNMENT_REMINDER notification per user per assignment can ever exist,
-- regardless of how many times the job runs or overlaps.
-- Not expressible in schema.prisma (partial indexes need a preview feature
-- this project doesn't enable) - this migration is the source of truth for it,
-- same as the REPLICA IDENTITY / publication statements above.
CREATE UNIQUE INDEX "Notification_assignment_reminder_dedup_idx"
  ON "Notification" ("userId", "refId")
  WHERE "type" = 'ASSIGNMENT_REMINDER';
