ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
