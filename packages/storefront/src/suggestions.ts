/**
 * Two nudges at checkout, both from what the customer already did:
 *  - "Что забыли?": products they bought from this stall before and have
 *    not put in this cart, most often bought first;
 *  - "докинуть 200 г": one tap adds a bit more of a weighed line.
 */
import type { HaggleDto, OrderDto, ProductDto } from '@bazar/types';

/** Grams added by one tap on a weighed line, as a fraction of a kilo. */
export const TOP_UP_KG = 0.2;

export function forgottenProducts(
  orders: readonly OrderDto[],
  storeId: string,
  inCart: ReadonlySet<string>,
  products: readonly ProductDto[],
  limit = 6,
): ProductDto[] {
  const bought = new Map<string, number>();
  for (const order of orders) {
    if (order.storeId !== storeId) continue;
    for (const item of order.items) {
      if (item.productId !== null)
        bought.set(item.productId, (bought.get(item.productId) ?? 0) + 1);
    }
  }
  const byId = new Map(products.map((product) => [product.id, product]));
  return [...bought.entries()]
    .filter(([id]) => !inCart.has(id) && byId.get(id)?.available === true)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id)!)
    .filter((product): product is ProductDto => product !== undefined);
}

/** The vendor marked it this morning: the badge lasts a day. */
export const arrivedToday = (product: { arrivedAt: string | null }, now = new Date()): boolean =>
  product.arrivedAt !== null && now.getTime() - Date.parse(product.arrivedAt) < 24 * 3_600_000;

/** The live ask for a product: pending, or an accepted price that has not expired. */
export function haggleFor(
  haggles: readonly HaggleDto[],
  productId: string,
  now = new Date(),
): HaggleDto | null {
  return (
    haggles.find(
      (h) =>
        h.productId === productId &&
        Date.parse(h.expiresAt) > now.getTime() &&
        (h.status === 'PENDING' || h.status === 'ACCEPTED'),
    ) ??
    haggles.find((h) => h.productId === productId && h.status === 'DECLINED') ??
    null
  );
}
