-- Shops next to the stalls: chains, and per-store order limits.
ALTER TABLE "stores" ADD COLUMN "chainSlug" TEXT;
ALTER TABLE "stores" ADD COLUMN "minOrder" INTEGER;
ALTER TABLE "stores" ADD COLUMN "freeDeliveryThreshold" INTEGER;
CREATE INDEX "stores_tenantId_chainSlug_idx" ON "stores"("tenantId", "chainSlug");
