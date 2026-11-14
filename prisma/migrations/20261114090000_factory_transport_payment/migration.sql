ALTER TABLE "CheckoutSession" ADD COLUMN IF NOT EXISTS "quoteOfferId" TEXT;
CREATE INDEX IF NOT EXISTS "CheckoutSession_quoteOfferId_idx" ON "CheckoutSession"("quoteOfferId");

CREATE TABLE IF NOT EXISTS "TransportPayment" (
    "id" TEXT NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "requiredVehicleType" "VehicleType" NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "pricePerKm" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "CheckoutPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentMethod" "CheckoutPaymentMethod",
    "eupagoReference" TEXT,
    "eupagoEntity" TEXT,
    "eupagoTransactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransportPayment_paymentNumber_key" ON "TransportPayment"("paymentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "TransportPayment_orderId_key" ON "TransportPayment"("orderId");
CREATE INDEX IF NOT EXISTS "TransportPayment_payerId_status_idx" ON "TransportPayment"("payerId", "status");
CREATE INDEX IF NOT EXISTS "TransportPayment_eupagoReference_idx" ON "TransportPayment"("eupagoReference");

DO $$
BEGIN
    ALTER TABLE "TransportPayment"
        ADD CONSTRAINT "TransportPayment_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
