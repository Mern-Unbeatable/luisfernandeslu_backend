-- Factory order auctions: add PENDING_PAYMENT status, isFactoryOrder flag, bidStartPrice

DO $$ BEGIN
  ALTER TYPE "AuctionStatus" ADD VALUE 'PENDING_PAYMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ShipmentAuction" ADD COLUMN IF NOT EXISTS "isFactoryOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShipmentAuction" ADD COLUMN IF NOT EXISTS "bidStartPrice" DOUBLE PRECISION;
