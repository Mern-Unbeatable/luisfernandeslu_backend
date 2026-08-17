-- Align Invoice with per-audience rows (SUPPLIER / CUSTOMER).
-- DB may already have audience + compound unique from a prior push; keep this idempotent.

DO $$ BEGIN
  CREATE TYPE "InvoiceAudience" AS ENUM ('SUPPLIER', 'CUSTOMER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "audience" "InvoiceAudience" NOT NULL DEFAULT 'SUPPLIER';

-- Replace 1:1 orderId unique with (orderId, audience)
DROP INDEX IF EXISTS "Invoice_orderId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_orderId_audience_key" ON "Invoice"("orderId", "audience");
CREATE INDEX IF NOT EXISTS "Invoice_orderId_idx" ON "Invoice"("orderId");
