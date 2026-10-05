-- Quantity prices: «от 10 кг по 16 000», «3 шт за 10 000» (kept per piece).
CREATE TABLE "product_price_tiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQuantity" DECIMAL(10,3) NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "product_price_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_price_tiers_productId_minQuantity_key" ON "product_price_tiers"("productId", "minQuantity");

ALTER TABLE "product_price_tiers" ADD CONSTRAINT "product_price_tiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
