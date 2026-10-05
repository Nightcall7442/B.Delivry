-- The platform's cut, fixed on the order when it is placed: the vendor's own rate, else the
-- tariff's. Until now the payout subtracted only a vendor's own rate, so a stall on the tariff
-- was shown (and owed) its whole subtotal.
ALTER TABLE "orders" ADD COLUMN "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Orders already placed: the vendor's rate, else the active tariff of the delivery city (the
-- zone an order was priced in is not kept; the city's default tariff is what most zones use),
-- else the global one — the same order the pricing service looks a tariff up in.
UPDATE "orders" AS o
SET "commissionPercent" = COALESCE(
  v."commissionPercent",
  (
    SELECT t."commissionPercent"
    FROM "tariffs" AS t
    WHERE t."active" AND (t."cityId" = o."addressCityId" OR t."cityId" IS NULL)
    ORDER BY t."cityId" IS NULL, t."createdAt"
    LIMIT 1
  ),
  0
)
FROM "stores" AS s
JOIN "vendors" AS v ON v."id" = s."vendorId"
WHERE s."id" = o."storeId";
