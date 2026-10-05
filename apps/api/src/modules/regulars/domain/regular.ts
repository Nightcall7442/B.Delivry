/**
 * «Свой продавец», the stall's memory of one customer, from the orders they had delivered from it:
 * the goods they come back for, and what they asked for on their lines. Pure.
 */
import type { Translated } from '@bazar/types';

export interface PastOrder {
  items: readonly { productId: string | null; name: unknown; comment: string | null }[];
}

const USUAL_LIMIT = 3;
const WISH_LIMIT = 5;

/** Goods in two orders or more, the most often first (orders newest first: a tie goes to the latest). */
export function usualOf(orders: readonly PastOrder[]): { name: Translated; orders: number }[] {
  const seen = new Map<string, { name: Translated; orders: number; first: number }>();
  orders.forEach((order, index) => {
    const once = new Set<string>();
    for (const item of order.items) {
      const name = item.name as Translated;
      // A deleted good keeps its line: the name is the key then.
      const key = item.productId ?? `name:${name['ru'] ?? ''}`;
      if (once.has(key)) continue;
      once.add(key);
      const entry = seen.get(key);
      if (entry) entry.orders += 1;
      else seen.set(key, { name, orders: 1, first: index });
    }
  });
  return [...seen.values()]
    .filter((entry) => entry.orders >= 2)
    .sort((a, b) => b.orders - a.orders || a.first - b.first)
    .slice(0, USUAL_LIMIT)
    .map(({ name, orders: times }) => ({ name, orders: times }));
}

/** What they wrote on their lines, latest first, each once whatever its case. */
export function wishesOf(orders: readonly PastOrder[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      const wish = item.comment?.trim();
      if (!wish) continue;
      const key = wish.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(wish);
      if (out.length === WISH_LIMIT) return out;
    }
  }
  return out;
}
