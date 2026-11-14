-- Columns, enum values and a table that were added to schema.prisma without a migration.

ALTER TYPE "ChatThreadType" ADD VALUE IF NOT EXISTS 'DISPUTE';

ALTER TYPE "CheckoutPaymentMethod" ADD VALUE IF NOT EXISTS 'PAYSHOP';

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChatThreadParticipant" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "assistant_chat_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "products" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_chat_message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_chat_message_userId_createdAt_idx" ON "assistant_chat_message"("userId", "createdAt");

DO $$
BEGIN
    ALTER TABLE "assistant_chat_message" ADD CONSTRAINT "assistant_chat_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
