import type { PaymentMethod } from '@bazar/constants';
import type { LatLngDto, OrderItemDto, OrderTotalsDto, Translated } from '@bazar/types';

import type { DeliveryAddress } from './address.js';

/**
 * What a storefront keeps about an order it placed. A subset of OrderDto plus
 * the two points the tracking map needs; status is derived (see simulate.ts).
 */
/**
 * "Повторить заказ": the same lines back on the cart at the quantities that
 * were ordered (not what the scale showed), replacing any leftovers of the
 * same products; other stalls' lines stay.
 */
export function repeatQuantities(
  items: readonly { productId: string | null; quantity: number }[],
  current: Record<string, number>,
): Record<string, number> {
  const next = { ...current };
  for (const item of items) {
    if (item.productId === null) continue;
    next[item.productId] = item.quantity;
  }
  return next;
}

/**
 * «Как в прошлый раз»: the wishes that went with the lines («без кости»), to put back beside them —
 * the stall reads them again as it did then.
 */
export function repeatNotes(
  items: readonly { productId: string | null; comment: string | null }[],
): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const item of items) {
    const wish = item.comment?.trim();
    if (item.productId !== null && wish) notes[item.productId] = wish;
  }
  return notes;
}

export interface LocalOrder {
  id: string;
  number: string;
  storeId: string;
  storeName: Translated;
  storePoint: LatLngDto;
  preparationMinutes: number;
  items: Array<
    Pick<OrderItemDto, 'productId' | 'name' | 'unit' | 'quantity' | 'unitPrice' | 'total'>
  >;
  totals: OrderTotalsDto;
  address: DeliveryAddress;
  paymentMethod: PaymentMethod;
  comment: string | null;
  placedAt: string;
  cancelledAt: string | null;
}

export type OrderDraft = Omit<LocalOrder, 'id' | 'number' | 'placedAt' | 'cancelledAt'>;
