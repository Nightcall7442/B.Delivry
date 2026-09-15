/**
 * Order progress as a pure function of time.
 *
 * Without the API there is no courier, so the status timeline is derived from
 * how long ago the order was placed: no timers to persist, reload-safe, and the
 * courier "moves" because the position is interpolated from the same clock.
 *
 * ponytail: demo timeline, ~3 minutes to delivery. Real statuses arrive over
 * the tracking websocket; this file goes away with it.
 */
import { CUSTOMER_CANCELLABLE_STATUSES, ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import type { LatLngDto } from '@bazar/types';

import type { LocalOrder } from './order.js';

/** Seconds after placement when each status begins. */
const TIMELINE: ReadonlyArray<[OrderStatus, number]> = [
  [ORDER_STATUS.PENDING, 0],
  [ORDER_STATUS.CONFIRMED, 4],
  [ORDER_STATUS.SEARCHING_COURIER, 8],
  [ORDER_STATUS.COURIER_ASSIGNED, 22],
  [ORDER_STATUS.COURIER_ARRIVED_PICKUP, 55],
  [ORDER_STATUS.PICKING_UP, 62],
  [ORDER_STATUS.PICKED_UP, 95],
  [ORDER_STATUS.IN_DELIVERY, 100],
  [ORDER_STATUS.COURIER_ARRIVED, 160],
  [ORDER_STATUS.DELIVERED, 172],
];

const at = (status: OrderStatus): number => TIMELINE.find(([s]) => s === status)?.[1] ?? 0;
const DONE_AT = at(ORDER_STATUS.DELIVERED);

export interface OrderProgress {
  status: OrderStatus;
  courier: LatLngDto | null;
  /** Minutes until the door; null once nothing is moving. */
  etaMinutes: number | null;
  cancellable: boolean;
}

const lerp = (a: LatLngDto, b: LatLngDto, t: number): LatLngDto => ({
  lat: a.lat + (b.lat - a.lat) * t,
  lng: a.lng + (b.lng - a.lng) * t,
});
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function progressAt(order: LocalOrder, now: number): OrderProgress {
  if (order.cancelledAt) {
    return { status: ORDER_STATUS.CANCELLED, courier: null, etaMinutes: null, cancellable: false };
  }

  const elapsed = (now - Date.parse(order.placedAt)) / 1000;
  let status: OrderStatus = ORDER_STATUS.PENDING;
  for (const [candidate, start] of TIMELINE) if (elapsed >= start) status = candidate;

  // The courier starts ~1.2 km south-east of the stall and rides in.
  const start: LatLngDto = { lat: order.storePoint.lat - 0.008, lng: order.storePoint.lng + 0.012 };
  const home = order.address.point;
  let courier: LatLngDto | null = null;
  switch (status) {
    case ORDER_STATUS.COURIER_ASSIGNED:
      courier = lerp(
        start,
        order.storePoint,
        clamp01((elapsed - at(status)) / (at(ORDER_STATUS.COURIER_ARRIVED_PICKUP) - at(status))),
      );
      break;
    case ORDER_STATUS.COURIER_ARRIVED_PICKUP:
    case ORDER_STATUS.PICKING_UP:
    case ORDER_STATUS.PICKED_UP:
      courier = order.storePoint;
      break;
    case ORDER_STATUS.IN_DELIVERY:
      courier = lerp(
        order.storePoint,
        home,
        clamp01((elapsed - at(status)) / (at(ORDER_STATUS.COURIER_ARRIVED) - at(status))),
      );
      break;
    case ORDER_STATUS.COURIER_ARRIVED:
    case ORDER_STATUS.DELIVERED:
      courier = home;
      break;
    default:
      courier = null;
  }

  const etaMinutes = elapsed < DONE_AT ? Math.max(1, Math.ceil((DONE_AT - elapsed) / 60)) : null;
  return {
    status,
    courier,
    etaMinutes,
    cancellable: CUSTOMER_CANCELLABLE_STATUSES.includes(status),
  };
}
