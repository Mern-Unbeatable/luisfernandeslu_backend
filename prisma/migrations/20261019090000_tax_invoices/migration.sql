CREATE TABLE IF NOT EXISTS "TaxInvoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'invoicexpress',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "documentType" TEXT,
    "externalId" TEXT,
    "sequenceNumber" TEXT,
    "atcud" TEXT,
    "permalink" TEXT,
    "vatRate" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaxInvoice_orderId_key" ON "TaxInvoice"("orderId");
CREATE INDEX IF NOT EXISTS "TaxInvoice_status_idx" ON "TaxInvoice"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TaxInvoice_orderId_fkey'
  ) THEN
    ALTER TABLE "TaxInvoice"
      ADD CONSTRAINT "TaxInvoice_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
