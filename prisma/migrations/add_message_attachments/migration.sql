-- One optional attachment per chat message (image or file), stored in the
-- public "chat-attachments" Supabase Storage bucket. A message may carry text,
-- an attachment, or both. On soft delete, content is NULLed and these columns
-- are cleared too (see the delete actions).

ALTER TABLE "Message"
  ADD COLUMN "attachmentUrl" TEXT,
  ADD COLUMN "attachmentType" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;

ALTER TABLE "DirectMessage"
  ADD COLUMN "attachmentUrl" TEXT,
  ADD COLUMN "attachmentType" TEXT,
  ADD COLUMN "attachmentName" TEXT,
  ADD COLUMN "attachmentSize" INTEGER;
