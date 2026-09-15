/**
 * The two public promises, as the order screen reads them. Numbers come from
 * GUARANTEE; the API keeps the late promise itself (see order-guarantee.handler).
 */
import { GUARANTEE } from '@bazar/constants';

interface Timed {
  promisedAt: string | null;
  deliveredAt: string | null;
}

/** Minutes past the promise, or 0 — also 0 when either side is unknown. */
export function lateMinutes(order: Timed): number {
  if (order.promisedAt === null || order.deliveredAt === null) return 0;
  return Math.max(
    0,
    Math.floor((Date.parse(order.deliveredAt) - Date.parse(order.promisedAt)) / 60_000),
  );
}

/** The late promise kicked in: the delivery fee went back to the balance. */
export const lateRefundDue = (order: Timed): boolean =>
  lateMinutes(order) > GUARANTEE.LATE_TOLERANCE_MINUTES;

/** Freshness complaints are accepted this long after the door. */
export function freshnessDeadline(order: Timed): Date | null {
  if (order.deliveredAt === null) return null;
  return new Date(Date.parse(order.deliveredAt) + GUARANTEE.FRESHNESS_WINDOW_HOURS * 3_600_000);
}

export const freshnessOpen = (order: Timed, now: Date = new Date()): boolean => {
  const deadline = freshnessDeadline(order);
  return deadline !== null && now < deadline;
};

/** Bazar Plus is on for this account right now. */
export const plusActive = (
  user: { plusUntil: string | null } | null | undefined,
  now = new Date(),
): boolean =>
  user?.plusUntil !== null &&
  user?.plusUntil !== undefined &&
  Date.parse(user.plusUntil) > now.getTime();
