/*
  Warnings:

  - Added the required column `updatedAt` to the `PromoCode` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PromoAudience" AS ENUM ('ALL', 'CUSTOMER', 'COMPANY');

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN     "applicableUsers" "PromoAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "PromoCode_sellerId_isActive_idx" ON "PromoCode"("sellerId", "isActive");

-- CreateIndex
CREATE INDEX "PromoCode_expiryDate_idx" ON "PromoCode"("expiryDate");

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
