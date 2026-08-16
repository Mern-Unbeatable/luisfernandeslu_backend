-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CheckoutPaymentStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CheckoutPaymentMethod" AS ENUM ('MULTIBANCO', 'MBWAY', 'CREDITCARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CheckoutSplitBeneficiary" AS ENUM ('SELLER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable BusinessProfile
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "eupagoExternKey" TEXT;

-- CreateTable CheckoutSession
CREATE TABLE IF NOT EXISTS "CheckoutSession" (
    "id" TEXT NOT NULL,
    "checkoutNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentStatus" "CheckoutPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentMethod" "CheckoutPaymentMethod" NOT NULL DEFAULT 'MULTIBANCO',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "billingAddressId" TEXT NOT NULL,
    "shippingAddressId" TEXT NOT NULL,
    "projectId" TEXT,
    "unloadingType" TEXT,
    "unloadingLocationDescription" TEXT,
    "accessConditions" TEXT,
    "additionalNotes" TEXT,
    "subTotal" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "shippingFee" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "eupagoReference" TEXT,
    "eupagoEntity" TEXT,
    "eupagoTransactionId" TEXT,
    "cartItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutSession_checkoutNumber_key" ON "CheckoutSession"("checkoutNumber");
CREATE INDEX IF NOT EXISTS "CheckoutSession_customerId_paymentStatus_idx" ON "CheckoutSession"("customerId", "paymentStatus");
CREATE INDEX IF NOT EXISTS "CheckoutSession_eupagoReference_idx" ON "CheckoutSession"("eupagoReference");

DO $$ BEGIN
  ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_billingAddressId_fkey"
    FOREIGN KEY ("billingAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_shippingAddressId_fkey"
    FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable CheckoutPaymentSplit
CREATE TABLE IF NOT EXISTS "CheckoutPaymentSplit" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "beneficiaryType" "CheckoutSplitBeneficiary" NOT NULL,
    "sellerId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "externKey" TEXT NOT NULL,
    "identifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutPaymentSplit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CheckoutPaymentSplit_checkoutSessionId_idx" ON "CheckoutPaymentSplit"("checkoutSessionId");
CREATE INDEX IF NOT EXISTS "CheckoutPaymentSplit_sellerId_idx" ON "CheckoutPaymentSplit"("sellerId");

DO $$ BEGIN
  ALTER TABLE "CheckoutPaymentSplit" ADD CONSTRAINT "CheckoutPaymentSplit_checkoutSessionId_fkey"
    FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "checkoutSessionId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_checkoutSessionId_idx" ON "Order"("checkoutSessionId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_checkoutSessionId_fkey"
    FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
