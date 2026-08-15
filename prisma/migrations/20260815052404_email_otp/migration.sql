-- CreateTable
CREATE TABLE "email_otp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_otp_email_idx" ON "email_otp"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_otp_email_purpose_key" ON "email_otp"("email", "purpose");
