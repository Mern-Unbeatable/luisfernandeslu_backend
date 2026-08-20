-- Allow multiple bids per transporter on the same auction
DROP INDEX IF EXISTS "TransporterBid_auctionId_transporterId_key";
CREATE INDEX IF NOT EXISTS "TransporterBid_auctionId_transporterId_idx" ON "TransporterBid"("auctionId", "transporterId");
CREATE INDEX IF NOT EXISTS "TransporterBid_auctionId_createdAt_idx" ON "TransporterBid"("auctionId", "createdAt");
