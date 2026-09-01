-- AlterTable
ALTER TABLE "Message" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Soft delete clears the body to NULL, so content can no longer be NOT NULL.
ALTER TABLE "Message" ALTER COLUMN "content" DROP NOT NULL;
