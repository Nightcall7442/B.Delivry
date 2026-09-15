CREATE TYPE "HaggleStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

CREATE TABLE "discount_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "askedPrice" INTEGER NOT NULL,
    "offeredPrice" INTEGER,
    "status" "HaggleStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reply" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discount_requests_tenantId_storeId_status_idx" ON "discount_requests"("tenantId", "storeId", "status");
CREATE INDEX "discount_requests_customerId_productId_status_idx" ON "discount_requests"("customerId", "productId", "status");
