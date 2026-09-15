/**
 * Turns the flat id -> quantity map into one group per store.
 *
 * This is where the money adds up, and rounding a half-kilo line the wrong way
 * is the kind of bug nobody notices until a customer does — hence the test.
 */
import type { ProductDto } from '@bazar/types';

import type { CartLine, CartStoreGroup } from './cart.js';

export function groupByStore(
  products: readonly ProductDto[],
  quantities: Record<string, number>,
): CartStoreGroup[] {
  const groups = new Map<string, CartStoreGroup>();

  for (const product of products) {
    const quantity = quantities[product.id];
    if (!quantity || quantity <= 0) continue;

    // Prices are integer minor units; a 0.5 kg line must land back on an integer.
    const line: CartLine = {
      product,
      quantity,
      total: {
        amount: Math.round(product.price.amount * quantity),
        currency: product.price.currency,
      },
    };

    const group = groups.get(product.storeId) ?? {
      storeId: product.storeId,
      lines: [],
      unavailable: [],
      subtotal: { amount: 0, currency: product.price.currency },
    };

    if (product.available) {
      group.lines.push(line);
      group.subtotal = { ...group.subtotal, amount: group.subtotal.amount + line.total.amount };
    } else {
      group.unavailable.push(line);
    }

    groups.set(product.storeId, group);
  }

  return [...groups.values()];
}
