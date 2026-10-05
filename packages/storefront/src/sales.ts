/**
 * «Честная скидка» on the customer's side: how deep a cut is, and which goods make the «Скидки»
 * rail. The API keeps the struck-through price honest (the lowest of the last week); this only
 * reads it.
 */
import type { MoneyDto } from '@bazar/types';

interface Priced {
  price: MoneyDto;
  oldPrice: MoneyDto | null;
}

/** Whole percent off; 0 when there is no real sale (no old price, or one not above the price). */
export function discountPercent(product: Priced): number {
  const old = product.oldPrice?.amount ?? 0;
  if (old <= product.price.amount) return 0;
  return Math.round((1 - product.price.amount / old) * 100);
}

/**
 * The «Скидки» rail: goods on sale and in stock, deepest cut first, at most `perStall` from one
 * stall so a single seller's clearance does not fill it, `limit` in all.
 */
export function dealsOf<T extends Priced & { storeId: string; available: boolean }>(
  products: readonly T[],
  { limit = 12, perStall = 3 }: { limit?: number; perStall?: number } = {},
): T[] {
  const taken = new Map<string, number>();
  const deals: T[] = [];
  const onSale = products
    .filter((product) => product.available && discountPercent(product) > 0)
    .sort((a, b) => discountPercent(b) - discountPercent(a));
  for (const product of onSale) {
    const count = taken.get(product.storeId) ?? 0;
    if (count >= perStall) continue;
    taken.set(product.storeId, count + 1);
    deals.push(product);
    if (deals.length === limit) break;
  }
  return deals;
}
