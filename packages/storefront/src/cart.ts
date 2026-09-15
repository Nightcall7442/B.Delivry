/**
 * 'cart' view-model types.
 *
 */
import type { MoneyDto, ProductDto } from '@bazar/types';

/** What the browser stores: product id -> quantity in the product's own unit. */
export type CartQuantities = Record<string, number>;

export interface CartLine {
  product: ProductDto;
  quantity: number;
  total: MoneyDto;
}

/**
 * One group per store. A bazaar order is picked up at a single stall, so two
 * stores mean two courier trips and therefore two orders — the cart screen
 * shows that split instead of hiding it until checkout.
 */
export interface CartStoreGroup {
  storeId: string;
  lines: CartLine[];
  subtotal: MoneyDto;
  /** Lines whose product went out of stock while sitting in the cart. */
  unavailable: CartLine[];
}

/**
 * A cart as a link: "id:qty,id:qty" in `?share=` — short enough for a chat
 * message, readable enough to debug. Decoding ignores anything malformed.
 */
export const encodeShare = (quantities: CartQuantities): string =>
  Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => `${id}:${quantity}`)
    .join(',');

export function decodeShare(value: string | null | undefined): CartQuantities {
  const result: CartQuantities = {};
  for (const pair of (value ?? '').split(',')) {
    const [id, raw] = pair.split(':');
    const quantity = Number(raw);
    if (id && quantity > 0 && Number.isFinite(quantity)) result[id] = quantity;
  }
  return result;
}
