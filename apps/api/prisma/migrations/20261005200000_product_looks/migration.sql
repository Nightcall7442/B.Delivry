-- «Покажите товар»: a customer asks the stall for a live photo of a good; the stall answers with one.
-- CreateTable
CREATE TABLE "product_looks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "photoUrl" TEXT,
    "answeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_looks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_looks_tenantId_storeId_answeredAt_idx" ON "product_looks"("tenantId", "storeId", "answeredAt");

-- CreateIndex
CREATE INDEX "product_looks_customerId_productId_idx" ON "product_looks"("customerId", "productId");

-- CreateIndex
CREATE INDEX "product_looks_productId_answeredAt_idx" ON "product_looks"("productId", "answeredAt");

-- AddForeignKey
ALTER TABLE "product_looks" ADD CONSTRAINT "product_looks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An answer is a photo and its time together, never one without the other.
ALTER TABLE "product_looks" ADD CONSTRAINT "product_looks_answer_check" CHECK (("photoUrl" IS NULL) = ("answeredAt" IS NULL));
