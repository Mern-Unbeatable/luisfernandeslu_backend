DO $$
BEGIN
    CREATE TYPE "DeliveryMode" AS ENUM ('SELF', 'CARRIER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryMode" "DeliveryMode";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryDecisionDeadline" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "selfDeliveryDeadline" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_deliveryMode_deliveryDecisionDeadline_idx" ON "Order"("deliveryMode", "deliveryDecisionDeadline");
