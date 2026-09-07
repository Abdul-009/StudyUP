-- AlterTable
ALTER TABLE "Message" ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN "isEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "editedAt" TIMESTAMP(3);
