-- Drop old single promo FK/column on Cart
ALTER TABLE "Cart" DROP CONSTRAINT IF EXISTS "Cart_promoCodeId_fkey";
DROP INDEX IF EXISTS "Cart_promoCodeId_idx";
ALTER TABLE "Cart" DROP COLUMN IF EXISTS "promoCodeId";

-- CreateTable
CREATE TABLE IF NOT EXISTS "CartPromoCode" (
    "cartId" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartPromoCode_pkey" PRIMARY KEY ("cartId","promoCodeId")
);

CREATE INDEX IF NOT EXISTS "CartPromoCode_promoCodeId_idx" ON "CartPromoCode"("promoCodeId");

DO $$ BEGIN
  ALTER TABLE "CartPromoCode" ADD CONSTRAINT "CartPromoCode_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CartPromoCode" ADD CONSTRAINT "CartPromoCode_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
