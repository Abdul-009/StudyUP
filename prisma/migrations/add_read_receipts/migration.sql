-- Read receipts / manual mark-as-read for group chat and direct messages.
--
--   MessageRead        - one row = "this user has read this group message"
--   DirectMessageRead  - one row = "this user has read this direct message"
--
-- A missing row means unread. "Seen" on a message you sent is derived: any read
-- row for that message by someone other than you. groupId / conversationId are
-- denormalized onto the read rows purely so the Realtime client can subscribe
-- with a groupId=eq / conversationId=eq filter.

-- CreateTable MessageRead
CREATE TABLE "MessageRead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable DirectMessageRead
CREATE TABLE "DirectMessageRead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageRead_messageId_userId_key" ON "MessageRead"("messageId", "userId");
CREATE INDEX "MessageRead_groupId_idx" ON "MessageRead"("groupId");
CREATE UNIQUE INDEX "DirectMessageRead_messageId_userId_key" ON "DirectMessageRead"("messageId", "userId");
CREATE INDEX "DirectMessageRead_conversationId_idx" ON "DirectMessageRead"("conversationId");

-- AddForeignKey
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageRead" ADD CONSTRAINT "MessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageRead" ADD CONSTRAINT "DirectMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageRead" ADD CONSTRAINT "DirectMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
