-- Web Push subscriptions: one row per browser/device a user has opted in from.
-- Written and read only through server actions (src/lib/push-actions.ts) and the
-- service-role push sender (src/lib/push.ts). RLS is enabled anyway so a user's
-- push endpoints can never be read by anyone else even via a direct PostgREST
-- call with their own JWT.

-- CreateTable PushSubscription
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: a user only ever touches their own subscription rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own push subscriptions"
  ON "PushSubscription"
  FOR SELECT
  USING (auth.uid()::text = "userId"::text);

CREATE POLICY "Users can add own push subscriptions"
  ON "PushSubscription"
  FOR INSERT
  WITH CHECK (auth.uid()::text = "userId"::text);

CREATE POLICY "Users can update own push subscriptions"
  ON "PushSubscription"
  FOR UPDATE
  USING (auth.uid()::text = "userId"::text)
  WITH CHECK (auth.uid()::text = "userId"::text);

CREATE POLICY "Users can remove own push subscriptions"
  ON "PushSubscription"
  FOR DELETE
  USING (auth.uid()::text = "userId"::text);
