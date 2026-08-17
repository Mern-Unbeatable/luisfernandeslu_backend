-- Factory → supplier offers (no QuoteRequest). Same offer body as supplier → company.

DO $$ BEGIN
  ALTER TYPE "OrderSource" ADD VALUE 'FACTORY_CONVERSION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "QuoteOffer" ALTER COLUMN "quoteRequestId" DROP NOT NULL;

ALTER TABLE "QuoteOffer" ADD COLUMN IF NOT EXISTS "chatThreadId" TEXT;
ALTER TABLE "QuoteOffer" ADD COLUMN IF NOT EXISTS "buyerId" TEXT;

CREATE INDEX IF NOT EXISTS "QuoteOffer_chatThreadId_status_idx" ON "QuoteOffer"("chatThreadId", "status");
CREATE INDEX IF NOT EXISTS "QuoteOffer_buyerId_idx" ON "QuoteOffer"("buyerId");

DO $$ BEGIN
  ALTER TABLE "QuoteOffer" ADD CONSTRAINT "QuoteOffer_chatThreadId_fkey"
    FOREIGN KEY ("chatThreadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "QuoteOffer" ADD CONSTRAINT "QuoteOffer_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
