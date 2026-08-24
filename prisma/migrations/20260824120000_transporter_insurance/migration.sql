-- CreateEnum
CREATE TYPE "InsuranceKind" AS ENUM ('CIVIL', 'CARGO');

-- CreateEnum
CREATE TYPE "InsurancePolicyStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransporterInsurance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "InsuranceKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "coverageAmount" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "documentUrl" TEXT,
    "status" "InsurancePolicyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransporterInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransporterInsurance_userId_kind_key" ON "TransporterInsurance"("userId", "kind");

-- CreateIndex
CREATE INDEX "TransporterInsurance_userId_kind_idx" ON "TransporterInsurance"("userId", "kind");

-- AddForeignKey
ALTER TABLE "TransporterInsurance" ADD CONSTRAINT "TransporterInsurance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
