import type { DeliveryOfferDto } from '@bazar/types';

/**
 * The offer cards on the courier's screen: what the socket pushed and what the server says is still
 * open, once each. The server's copy wins (it is the fresher one), a card the courier turned down
 * stays gone even if a poll that was already in flight still lists it, and a card past its deadline
 * is not shown — the caller drops those a second early so a tap never lands on a corpse.
 */
export function mergeOffers(
  current: readonly DeliveryOfferDto[],
  fetched: readonly DeliveryOfferDto[],
  dismissed: ReadonlySet<string> = new Set(),
  now: number = Date.now(),
): DeliveryOfferDto[] {
  const byDelivery = new Map<string, DeliveryOfferDto>();
  for (const offer of current) byDelivery.set(offer.deliveryId, offer);
  for (const offer of fetched) byDelivery.set(offer.deliveryId, offer);
  return [...byDelivery.values()]
    .filter((offer) => !dismissed.has(offer.deliveryId) && Date.parse(offer.expiresAt) > now)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}
