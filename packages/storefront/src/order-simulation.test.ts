import { describe, expect, it } from 'vitest';

import { progressAt } from './order-simulation.js';
import type { LocalOrder } from './order.js';

const placedAt = Date.parse('2026-09-12T10:00:00.000Z');
const order: LocalOrder = {
  id: 'o1',
  number: 'BZ-260912-TEST01',
  storeId: 'chorsu-zelen',
  storeName: { ru: 'Зелёный ряд' },
  storePoint: { lat: 41.3266, lng: 69.2347 },
  preparationMinutes: 20,
  items: [],
  totals: {
    subtotal: { amount: 0, currency: 'UZS' },
    deliveryFee: { amount: 0, currency: 'UZS' },
    serviceFee: { amount: 0, currency: 'UZS' },
    discount: { amount: 0, currency: 'UZS' },
    total: { amount: 0, currency: 'UZS' },
  },
  address: { text: 'ул. Мирабад, 12', point: { lat: 41.3, lng: 69.28 } },
  paymentMethod: 'CASH',
  comment: null,
  placedAt: new Date(placedAt).toISOString(),
  cancelledAt: null,
};

const at = (seconds: number) => progressAt(order, placedAt + seconds * 1000);

describe('progressAt', () => {
  it('walks the timeline forward and never backwards', () => {
    const seen = [0, 5, 10, 30, 60, 70, 97, 120, 165, 200].map((s) => at(s).status);
    expect(seen).toEqual([
      'PENDING',
      'CONFIRMED',
      'SEARCHING_COURIER',
      'COURIER_ASSIGNED',
      'COURIER_ARRIVED_PICKUP',
      'PICKING_UP',
      'PICKED_UP',
      'IN_DELIVERY',
      'COURIER_ARRIVED',
      'DELIVERED',
    ]);
  });

  it('moves the courier from the stall to the door while in delivery', () => {
    const start = at(100).courier;
    const end = at(159).courier;
    expect(start).toEqual(order.storePoint);
    expect(end?.lat).toBeCloseTo(order.address.point.lat, 3);
    expect(at(10).courier).toBeNull();
  });

  it('lets the customer cancel only until the goods are picked up', () => {
    expect(at(30).cancellable).toBe(true);
    expect(at(120).cancellable).toBe(false);
    expect(
      progressAt({ ...order, cancelledAt: new Date().toISOString() }, placedAt + 500_000).status,
    ).toBe('CANCELLED');
  });
});
