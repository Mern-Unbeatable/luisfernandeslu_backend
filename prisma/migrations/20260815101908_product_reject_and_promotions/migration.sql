/*
  Warnings:

  - You are about to drop the column `isApproved` on the `ProductPromotion` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PromotionPaymentStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PromotionApprovalStatus" AS ENUM ('AWAITING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "ProductPromotion" DROP COLUMN "isApproved",
ADD COLUMN     "approvalStatus" "PromotionApprovalStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentRef" TEXT,
ADD COLUMN     "paymentStatus" "PromotionPaymentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PromotionPlan" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionPlan_isActive_sortOrder_idx" ON "PromotionPlan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionPlan_durationDays_key" ON "PromotionPlan"("durationDays");

-- CreateIndex
CREATE INDEX "ProductPromotion_productId_approvalStatus_idx" ON "ProductPromotion"("productId", "approvalStatus");

-- CreateIndex
CREATE INDEX "ProductPromotion_approvalStatus_paymentStatus_idx" ON "ProductPromotion"("approvalStatus", "paymentStatus");

-- AddForeignKey
ALTER TABLE "ProductPromotion" ADD CONSTRAINT "ProductPromotion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PromotionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
