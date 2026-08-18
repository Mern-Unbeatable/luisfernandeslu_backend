-- Supplier ERP API keys for inventory management.
-- Allows suppliers to manage inventory from their external ERP system.

CREATE TABLE IF NOT EXISTS "SupplierErpApiKey" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "permissions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "SupplierErpApiKey_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SupplierErpApiKey_keyHash_key') THEN
    CREATE UNIQUE INDEX "SupplierErpApiKey_keyHash_key" ON "SupplierErpApiKey"("keyHash");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'SupplierErpApiKey_supplierId_revokedAt_idx') THEN
    CREATE INDEX "SupplierErpApiKey_supplierId_revokedAt_idx" ON "SupplierErpApiKey"("supplierId","revokedAt");
  END IF;
END $$;

-- Foreign key to User(supplier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'SupplierErpApiKey_supplierId_fkey'
  ) THEN
    ALTER TABLE "SupplierErpApiKey"
    ADD CONSTRAINT "SupplierErpApiKey_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

