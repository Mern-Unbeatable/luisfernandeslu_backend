-- CreateTable
CREATE TABLE "AffiliateTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minActiveClients" INTEGER NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateTier_minActiveClients_key" ON "AffiliateTier"("minActiveClients");

-- CreateIndex
CREATE INDEX "AffiliateTier_isActive_minActiveClients_idx" ON "AffiliateTier"("isActive", "minActiveClients");

-- CreateIndex
CREATE INDEX "AffiliateLink_affiliateId_idx" ON "AffiliateLink"("affiliateId");
