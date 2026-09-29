/**
 * An offer pushed into a reconnecting socket is lost; the app also asks the server for the open ones.
 * Merging both must never show a card twice, resurrect one the courier declined, or keep a dead one.
 */
import type { DeliveryOfferDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';

import { mergeOffers } from './courier-offers.js';

const NOW = Date.parse('2026-09-29T04:43:40Z');
const offer = (
  deliveryId: string,
  expiresInSeconds: number,
  storeName = 'Тандыр-нон',
): DeliveryOfferDto => ({
  deliveryId,
  orderId: `o-${deliveryId}`,
  orderNumber: 'BZ-1',
  storeName,
  pickupAddress: 'Т-1',
  dropoffAddress: 'Ургенч',
  distanceMeters: 1800,
  payout: { amount: 12_000, currency: 'UZS' },
  itemCount: 2,
  weightGrams: 1500,
  expiresAt: new Date(NOW + expiresInSeconds * 1000).toISOString(),
});

describe('mergeOffers', () => {
  it('shows an offer the socket missed once the server lists it', () => {
    expect(mergeOffers([], [offer('d1', 20)], new Set(), NOW).map((o) => o.deliveryId)).toEqual([
      'd1',
    ]);
  });

  it('shows an offer once when the socket and the server both have it, with the server’s copy', () => {
    const merged = mergeOffers(
      [offer('d1', 20, 'из сокета')],
      [offer('d1', 25, 'с сервера')],
      new Set(),
      NOW,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.storeName).toBe('с сервера');
  });

  it('keeps what only the socket knows', () => {
    expect(mergeOffers([offer('d1', 20)], [], new Set(), NOW)).toHaveLength(1);
  });

  it('does not bring back an offer the courier declined', () => {
    expect(mergeOffers([], [offer('d1', 20)], new Set(['d1']), NOW)).toEqual([]);
  });

  it('drops offers past their deadline', () => {
    expect(mergeOffers([offer('d1', -1)], [offer('d2', 0)], new Set(), NOW)).toEqual([]);
  });

  it('puts the offer that expires first on top', () => {
    const merged = mergeOffers([offer('late', 28)], [offer('soon', 9)], new Set(), NOW);
    expect(merged.map((o) => o.deliveryId)).toEqual(['soon', 'late']);
  });
});
