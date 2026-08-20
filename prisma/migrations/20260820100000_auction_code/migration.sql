-- Public display code for auctions (e.g. AUC-001)
ALTER TABLE "ShipmentAuction" ADD COLUMN IF NOT EXISTS "auctionCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentAuction_auctionCode_key" ON "ShipmentAuction"("auctionCode");
