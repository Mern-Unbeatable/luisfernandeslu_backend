-- Enforce one active ERP API key per supplier.
-- "Active" means revokedAt IS NULL.

WITH ranked AS (
  SELECT
    id,
    "supplierId",
    ROW_NUMBER() OVER (
      PARTITION BY "supplierId"
      ORDER BY "createdAt" DESC, id DESC
    ) AS rn
  FROM "SupplierErpApiKey"
  WHERE "revokedAt" IS NULL
)
UPDATE "SupplierErpApiKey" k
SET "revokedAt" = CURRENT_TIMESTAMP
FROM ranked r
WHERE k.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'SupplierErpApiKey_supplier_single_active_key'
  ) THEN
    CREATE UNIQUE INDEX "SupplierErpApiKey_supplier_single_active_key"
    ON "SupplierErpApiKey"("supplierId")
    WHERE "revokedAt" IS NULL;
  END IF;
END $$;

