-- Transporter delivery stepper: Assigned → Picked Up → In Transit → Completed.

DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE 'PICKED_UP';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "tripStartedAt" TIMESTAMP(3);
