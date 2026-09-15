ALTER TYPE "PaymentMethod" ADD VALUE 'INVOICE';
ALTER TYPE "PaymentPurpose" ADD VALUE 'PROMO';

ALTER TABLE "tenants" ADD COLUMN "branding" JSONB;

ALTER TABLE "customers" ADD COLUMN "companyName" TEXT,
ADD COLUMN "companyInn" TEXT,
ADD COLUMN "businessAppliedAt" TIMESTAMP(3),
ADD COLUMN "businessApprovedAt" TIMESTAMP(3),
ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "creditLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "couriers" ADD COLUMN "neighbour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "homeLat" DECIMAL(9,6),
ADD COLUMN "homeLng" DECIMAL(9,6),
ADD COLUMN "homeRadiusMeters" INTEGER;

ALTER TABLE "stores" ADD COLUMN "promotedUntil" TIMESTAMP(3),
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "products" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "orders" ADD COLUMN "groupId" TEXT,
ADD COLUMN "dueAt" TIMESTAMP(3);
CREATE INDEX "orders_groupId_idx" ON "orders"("groupId");

CREATE TABLE "search_queries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "results" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "storeId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "search_queries_tenantId_createdAt_idx" ON "search_queries"("tenantId", "createdAt");
CREATE INDEX "search_queries_tenantId_normalized_idx" ON "search_queries"("tenantId", "normalized");
