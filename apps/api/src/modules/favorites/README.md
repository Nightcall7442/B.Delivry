# favorites

«Избранное»: goods and stalls a customer saves to find again. Rows hold ids only; what the
storefront shows is read through the catalog and stores, so a hidden stall or a deleted good
never surfaces from a saved heart.

## Depends on

catalog (a good must be visible to be saved), stores (the same for a stall).

## Exposes

`GET /customers/me/favorites` — `{ productIds, storeIds }`, newest first.
`PUT|DELETE /customers/me/favorites/products/:productId`, `PUT|DELETE /customers/me/favorites/stores/:storeId` — idempotent.
