-- AlterTable
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "promoCodeId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Cart_promoCodeId_idx" ON "Cart"("promoCodeId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Cart" ADD CONSTRAINT "Cart_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
