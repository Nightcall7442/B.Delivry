/**
 * What both clients do between "Заказать" and the order screen: turn the pin
 * on the map into a saved address and explain the API's refusals in words.
 */
import { isApiError, type ApiClient } from '@bazar/api-client';
import { SAME_BAZAAR_METERS } from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import type { MoneyDto, OrderQuoteDto } from '@bazar/types';
import { createT, type MessageKey } from '@bazar/i18n';

import type { DeliveryAddress } from './address.js';
import type { OnlineProvider } from './labels.js';

/** The API's quote/create refusals → catalogue keys, so the customer reads them in their language. */
const ORDER_REASON_KEY: Record<string, MessageKey> = {
  'Order is below the minimum for this zone': 'checkout.reason.minOrder',
  'Address is outside every delivery zone': 'checkout.reason.outOfZone',
  'Store is closed': 'checkout.reason.storeClosed',
};

export function orderReasonText(reason: string | null | undefined, locale = 'ru'): string | null {
  const key = reason === undefined || reason === null ? undefined : ORDER_REASON_KEY[reason];
  return key === undefined ? null : createT(locale)(key);
}

/**
 * Online orders are paid on the provider's page: open (or reuse) the payment
 * for the order and hand back the URL to send the customer to. Null when the
 * provider is not configured — the order stands, the desk collects later.
 */
export async function startOnlinePayment(
  api: ApiClient,
  orderId: string,
  provider: OnlineProvider,
  returnUrl: string,
): Promise<string | null> {
  try {
    const payment = await api.payments.create({ orderId, method: 'ONLINE', provider, returnUrl });
    return payment.confirmationUrl;
  } catch {
    return null;
  }
}

/**
 * Online orders are paid after the stall has weighed the goods: the customer
 * pays for what is actually in the bag, never an estimate. Until then the
 * order screen explains the wait instead of showing a pay button.
 */
export function onlinePaymentDue(order: {
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  items: { actualQuantity: number | null }[];
}): 'not-online' | 'paid' | 'waiting' | 'due' {
  if (order.paymentMethod !== 'ONLINE') return 'not-online';
  if (order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'AUTHORIZED') return 'paid';
  if (['CANCELLED', 'FAILED', 'REFUNDED'].includes(order.status)) return 'not-online';
  const weighed = order.items.some((item) => item.actualQuantity !== null);
  const pickedUp = ['PICKED_UP', 'IN_DELIVERY', 'COURIER_ARRIVED', 'DELIVERED'].includes(
    order.status,
  );
  return weighed || pickedUp ? 'due' : 'waiting';
}

export const describeOrderError = (error: unknown, locale = 'ru'): string =>
  isApiError(error)
    ? (orderReasonText(error.message, locale) ?? `${error.message} (${error.code})`)
    : createT(locale)('common.error');

/**
 * The API wants a saved address; the pin on the map is not one yet. Save it the
 * first time, update it while the id is known, so a customer does not grow a
 * new address row per order.
 */
export async function ensureServerAddress(
  api: ApiClient,
  address: DeliveryAddress,
  remember: (saved: DeliveryAddress) => void,
): Promise<string> {
  const details = {
    ...(address.apartment ? { apartment: address.apartment } : {}),
    ...(address.entrance ? { entrance: address.entrance } : {}),
    point: address.point,
  };

  if (address.serverId) {
    const saved = await api.addresses
      .update(address.serverId, { street: address.text, ...details })
      .catch(() => null);
    if (saved) {
      remember(address);
      return saved.id;
    }
  }

  const zone = await api.geo.resolveZone(address.point).catch(() => null);
  const cities = zone?.cityId ? [] : await api.geo.cities();
  const cityId =
    zone?.cityId ?? cities.find((city) => city.code === 'UZ-TK-C')?.id ?? cities[0]?.id;
  if (!cityId) throw new Error('No city configured');

  const created = await api.addresses.create({ cityId, street: address.text, ...details });
  remember({ ...address, serverId: created.id, cityId });
  return created.id;
}

/**
 * Cross-bazaar: one quote per stall comes back; the screen shows one total.
 * Deliverable only when every stall is; the leader's distance, minimum and
 * free-delivery threshold; the slowest stall's ETA.
 */
export function combineQuotes(quotes: readonly OrderQuoteDto[]): OrderQuoteDto | null {
  const [leader] = quotes;
  if (leader === undefined) return null;
  const sum = (pick: (q: OrderQuoteDto) => MoneyDto): MoneyDto => ({
    amount: quotes.reduce((total, q) => total + pick(q).amount, 0),
    currency: pick(leader).currency,
  });
  const blocked = quotes.find((q) => !q.deliverable);
  return {
    deliverable: blocked === undefined,
    reason: blocked?.reason ?? null,
    distanceMeters: leader.distanceMeters,
    etaMinutes: Math.max(...quotes.map((q) => q.etaMinutes)),
    totals: {
      subtotal: sum((q) => q.totals.subtotal),
      deliveryFee: sum((q) => q.totals.deliveryFee),
      serviceFee: sum((q) => q.totals.serviceFee),
      discount: sum((q) => q.totals.discount),
      total: sum((q) => q.totals.total),
    },
    minOrder: leader.minOrder,
    freeDeliveryThreshold: leader.freeDeliveryThreshold,
    heavy: quotes.some((q) => q.heavy),
    heavySurcharge: sum((q) => q.heavySurcharge),
  };
}

/** Stalls close enough to be one bazaar: the cart may offer a single trip for them. */
export function sameBazaar(
  points: ReadonlyArray<{ lat: number; lng: number }>,
  maxMeters = SAME_BAZAAR_METERS,
): boolean {
  const [first, ...rest] = points;
  if (first === undefined || rest.length === 0) return false;
  return rest.every((point) => haversineMeters(first, point) <= maxMeters);
}
