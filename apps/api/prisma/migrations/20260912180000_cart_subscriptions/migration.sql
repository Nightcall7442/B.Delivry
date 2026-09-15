CREATE TABLE "cart_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "items" JSONB NOT NULL,
    "weekday" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastOrderId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cart_subscriptions_tenantId_active_nextRunAt_idx" ON "cart_subscriptions"("tenantId", "active", "nextRunAt");
CREATE INDEX "cart_subscriptions_customerId_idx" ON "cart_subscriptions"("customerId");

ALTER TABLE "cart_subscriptions" ADD CONSTRAINT "cart_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "addressId" TEXT;
