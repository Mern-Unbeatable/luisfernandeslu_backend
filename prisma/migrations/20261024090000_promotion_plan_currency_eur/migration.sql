-- AlterTable
ALTER TABLE "PromotionPlan" ALTER COLUMN "currency" SET DEFAULT 'EUR';

-- The marketplace trades in euro only.
UPDATE "PromotionPlan" SET "currency" = 'EUR' WHERE "currency" <> 'EUR';
