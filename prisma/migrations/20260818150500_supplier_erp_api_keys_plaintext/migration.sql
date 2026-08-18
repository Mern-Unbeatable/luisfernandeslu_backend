-- Keep plaintext API key for supplier visibility (requested behavior).
-- Existing rows will remain NULL and new rows will store plaintext key.

ALTER TABLE "SupplierErpApiKey"
ADD COLUMN IF NOT EXISTS "apiKey" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'SupplierErpApiKey_apiKey_key'
  ) THEN
    CREATE UNIQUE INDEX "SupplierErpApiKey_apiKey_key"
    ON "SupplierErpApiKey"("apiKey")
    WHERE "apiKey" IS NOT NULL;
  END IF;
END $$;

