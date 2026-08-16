-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'OFFER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "QuoteOfferStatus" AS ENUM ('PENDING_RESPONSE', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'PAID');

-- AlterTable ChatMessage
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "messageType" "ChatMessageType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "offerId" TEXT;

-- CreateTable QuoteOffer
CREATE TABLE IF NOT EXISTS "QuoteOffer" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "productId" TEXT,
    "warehouseLocation" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "totalQuantity" DOUBLE PRECISION NOT NULL,
    "quantityUnit" TEXT NOT NULL DEFAULT 'bags',
    "projectName" TEXT NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "unloadingType" TEXT NOT NULL,
    "accessConditions" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "installmentMonths" INTEGER NOT NULL,
    "status" "QuoteOfferStatus" NOT NULL DEFAULT 'PENDING_RESPONSE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable QuoteOfferInstallment
CREATE TABLE IF NOT EXISTS "QuoteOfferInstallment" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "QuoteOfferInstallment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "QuoteRequest_sellerId_status_idx" ON "QuoteRequest"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRequest_buyerId_status_idx" ON "QuoteRequest"("buyerId", "status");
CREATE INDEX IF NOT EXISTS "QuoteOffer_quoteRequestId_status_idx" ON "QuoteOffer"("quoteRequestId", "status");
CREATE INDEX IF NOT EXISTS "QuoteOfferInstallment_offerId_idx" ON "QuoteOfferInstallment"("offerId");
CREATE INDEX IF NOT EXISTS "ChatMessage_quoteRequestId_createdAt_idx" ON "ChatMessage"("quoteRequestId", "createdAt");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "QuoteOffer" ADD CONSTRAINT "QuoteOffer_quoteRequestId_fkey"
    FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteOffer" ADD CONSTRAINT "QuoteOffer_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteOffer" ADD CONSTRAINT "QuoteOffer_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteOfferInstallment" ADD CONSTRAINT "QuoteOfferInstallment_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "QuoteOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "QuoteOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cascade delete messages when quote is deleted (if not already)
DO $$ BEGIN
  ALTER TABLE "ChatMessage" DROP CONSTRAINT IF EXISTS "ChatMessage_quoteRequestId_fkey";
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_quoteRequestId_fkey"
    FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN others THEN NULL; END $$;
