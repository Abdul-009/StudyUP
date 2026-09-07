-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a transaction block as long as the new
-- value isn't used in the same transaction, which it isn't here.
ALTER TYPE "NotifType" ADD VALUE 'MENTION';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "mentionedUserIds" TEXT[] NOT NULL DEFAULT '{}';
