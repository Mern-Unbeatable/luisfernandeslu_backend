-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ChatThreadType" AS ENUM ('QUOTE', 'ORDER_TRANSPORT', 'FACTORY_SUPPLIER', 'ADMIN_SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable ChatThread
CREATE TABLE IF NOT EXISTS "ChatThread" (
    "id" TEXT NOT NULL,
    "type" "ChatThreadType" NOT NULL,
    "quoteRequestId" TEXT,
    "orderId" TEXT,
    "productId" TEXT,
    "peerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_quoteRequestId_key" ON "ChatThread"("quoteRequestId");
CREATE INDEX IF NOT EXISTS "ChatThread_type_orderId_idx" ON "ChatThread"("type", "orderId");
CREATE INDEX IF NOT EXISTS "ChatThread_type_productId_idx" ON "ChatThread"("type", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_type_orderId_key" ON "ChatThread"("type", "orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_type_productId_key" ON "ChatThread"("type", "productId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatThread_type_peerUserId_key" ON "ChatThread"("type", "peerUserId");

DO $$ BEGIN
  ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_quoteRequestId_fkey"
    FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable ChatThreadParticipant
CREATE TABLE IF NOT EXISTS "ChatThreadParticipant" (
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatThreadParticipant_pkey" PRIMARY KEY ("threadId","userId")
);

CREATE INDEX IF NOT EXISTS "ChatThreadParticipant_userId_idx" ON "ChatThreadParticipant"("userId");

DO $$ BEGIN
  ALTER TABLE "ChatThreadParticipant" ADD CONSTRAINT "ChatThreadParticipant_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatThreadParticipant" ADD CONSTRAINT "ChatThreadParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "chatThreadId" TEXT;
CREATE INDEX IF NOT EXISTS "ChatMessage_chatThreadId_createdAt_idx" ON "ChatMessage"("chatThreadId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatThreadId_fkey"
    FOREIGN KEY ("chatThreadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
