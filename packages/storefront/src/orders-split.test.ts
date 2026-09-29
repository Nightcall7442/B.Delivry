import { ALL_ORDER_STATUSES, ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import { describe, expect, it } from 'vitest';

import {
  defaultSegment,
  pickSegment,
  segmentOf,
  shownSegment,
  splitOrders,
  type OrderSplit,
} from './orders-split.js';

const order = (id: string, status: OrderStatus, placedAt = '2026-09-12T10:00:00.000Z') => ({
  id,
  status,
  placedAt,
  deliveredAt: null as string | null,
});

const split = (active: number, delivered: number, cancelled: number): OrderSplit<number> => ({
  active: Array.from({ length: active }, (_, i) => i),
  delivered: Array.from({ length: delivered }, (_, i) => i),
  cancelled: Array.from({ length: cancelled }, (_, i) => i),
});

describe('segmentOf', () => {
  it('puts every status in exactly one pile', () => {
    const piles = Object.fromEntries(
      ALL_ORDER_STATUSES.map((status) => [status, segmentOf(order('o', status))]),
    );
    expect(piles).toEqual({
      PENDING: 'active',
      CONFIRMED: 'active',
      SEARCHING_COURIER: 'active',
      COURIER_ASSIGNED: 'active',
      COURIER_ARRIVED_PICKUP: 'active',
      PICKING_UP: 'active',
      PICKED_UP: 'active',
      IN_DELIVERY: 'active',
      COURIER_ARRIVED: 'active',
      DELIVERED: 'delivered',
      CANCELLED: 'cancelled',
      FAILED: 'cancelled',
      REFUNDED: 'cancelled',
    });
  });

  it('keeps a refunded order that was delivered in the history', () => {
    const refunded = { ...order('o', ORDER_STATUS.REFUNDED), deliveredAt: '2026-09-12T11:00:00Z' };
    expect(segmentOf(refunded)).toBe('delivered');
  });

  it('reads a missing deliveredAt as not delivered', () => {
    expect(segmentOf({ status: ORDER_STATUS.REFUNDED, placedAt: '2026-09-12T10:00:00Z' })).toBe(
      'cancelled',
    );
  });
});

describe('splitOrders', () => {
  it('loses nobody and invents nobody', () => {
    const orders = ALL_ORDER_STATUSES.map((status) => order(status, status));
    const piles = splitOrders(orders);
    const ids = [...piles.active, ...piles.delivered, ...piles.cancelled].map((o) => o.id);
    expect(ids.sort()).toEqual(orders.map((o) => o.id).sort());
    expect(piles.delivered.map((o) => o.id)).toEqual(['DELIVERED']);
    expect(piles.cancelled.map((o) => o.id).sort()).toEqual(['CANCELLED', 'FAILED', 'REFUNDED']);
  });

  it('puts the newest first in every pile, whatever order they arrive in', () => {
    const piles = splitOrders([
      order('old', ORDER_STATUS.DELIVERED, '2026-09-01T10:00:00Z'),
      order('live', ORDER_STATUS.IN_DELIVERY, '2026-09-20T10:00:00Z'),
      order('new', ORDER_STATUS.DELIVERED, '2026-09-15T10:00:00Z'),
      order('mid', ORDER_STATUS.DELIVERED, '2026-09-08T10:00:00Z'),
      order('nope', ORDER_STATUS.CANCELLED, '2026-09-02T10:00:00Z'),
      order('failed', ORDER_STATUS.FAILED, '2026-09-03T10:00:00Z'),
    ]);
    expect(piles.delivered.map((o) => o.id)).toEqual(['new', 'mid', 'old']);
    expect(piles.cancelled.map((o) => o.id)).toEqual(['failed', 'nope']);
    expect(piles.active.map((o) => o.id)).toEqual(['live']);
  });

  it('compares moments, not strings: offsets and milliseconds count', () => {
    const piles = splitOrders([
      order('a', ORDER_STATUS.DELIVERED, '2026-09-12T10:00:00.000Z'),
      // 10:30 in Tashkent is 05:30 UTC: earlier than a, though it sorts later as text.
      order('b', ORDER_STATUS.DELIVERED, '2026-09-12T10:30:00+05:00'),
      order('c', ORDER_STATUS.DELIVERED, '2026-09-12T10:00:00.500Z'),
    ]);
    expect(piles.delivered.map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the arrival order for orders placed at the same moment', () => {
    const piles = splitOrders([
      order('first', ORDER_STATUS.DELIVERED),
      order('second', ORDER_STATUS.DELIVERED),
      order('third', ORDER_STATUS.DELIVERED),
    ]);
    expect(piles.delivered.map((o) => o.id)).toEqual(['first', 'second', 'third']);
  });

  it('does not touch the list it was given', () => {
    const orders = [
      order('old', ORDER_STATUS.DELIVERED, '2026-09-01T10:00:00Z'),
      order('new', ORDER_STATUS.DELIVERED, '2026-09-15T10:00:00Z'),
    ];
    splitOrders(orders);
    expect(orders.map((o) => o.id)).toEqual(['old', 'new']);
  });

  it('gives three empty piles for no orders', () => {
    expect(splitOrders([])).toEqual({ active: [], delivered: [], cancelled: [] });
  });
});

describe('defaultSegment', () => {
  it('opens on what is live, however much history there is', () => {
    expect(defaultSegment(split(1, 30, 4))).toBe('active');
  });

  it('opens on the history when nothing is live', () => {
    expect(defaultSegment(split(0, 3, 2))).toBe('delivered');
  });

  it('opens on cancelled only when it is all there is', () => {
    expect(defaultSegment(split(0, 0, 2))).toBe('cancelled');
  });

  it('says delivered when there is nothing at all', () => {
    expect(defaultSegment(split(0, 0, 0))).toBe('delivered');
  });
});

describe('shownSegment', () => {
  it('follows the default until the customer picks', () => {
    expect(shownSegment(null, split(1, 2, 0))).toBe('active');
    expect(shownSegment(null, split(0, 2, 0))).toBe('delivered');
  });

  it('keeps what the customer picked, as the orders come and go', () => {
    const pick = pickSegment('delivered', split(1, 2, 0));
    expect(shownSegment(pick, split(1, 2, 0))).toBe('delivered');
    expect(shownSegment(pick, split(0, 3, 0))).toBe('delivered');
    expect(shownSegment(pick, split(2, 3, 1))).toBe('delivered');
  });

  it('lets go of a pile that ran dry: the live order was just delivered', () => {
    const pick = pickSegment('active', split(1, 2, 0));
    expect(shownSegment(pick, split(0, 3, 0))).toBe('delivered');
    // and it is the default that follows, so an all-cancelled tab lands on cancelled
    expect(shownSegment(pick, split(0, 0, 1))).toBe('cancelled');
  });

  it('keeps a pile the customer opened empty: they asked for it', () => {
    const pick = pickSegment('cancelled', split(1, 2, 0));
    expect(pick.filled).toBe(false);
    expect(shownSegment(pick, split(1, 2, 0))).toBe('cancelled');
  });

  it('remembers whether the pick had orders when it was made', () => {
    expect(pickSegment('active', split(2, 0, 0))).toEqual({ segment: 'active', filled: true });
    expect(pickSegment('active', split(0, 0, 0))).toEqual({ segment: 'active', filled: false });
  });
});
