/**
 * The Orders tab in three piles: still on its way, delivered (the history the
 * customer comes back to for a repeat), and the ones that did not happen.
 */
import { isTerminalOrderStatus, ORDER_STATUS, type OrderStatus } from '@bazar/constants';

export type OrderSegment = 'active' | 'delivered' | 'cancelled';

/** The order the chips are laid out in — and the order the default looks in. */
export const ORDER_SEGMENTS: readonly OrderSegment[] = ['active', 'delivered', 'cancelled'];

/** What the split needs of an order: OrderDto has all of it. */
export interface SplittableOrder {
  status: OrderStatus;
  placedAt: string;
  deliveredAt?: string | null;
}

export type OrderSplit<T> = Record<OrderSegment, T[]>;

export function segmentOf(order: SplittableOrder): OrderSegment {
  if (!isTerminalOrderStatus(order.status)) return 'active';
  if (order.status === ORDER_STATUS.DELIVERED) return 'delivered';
  // A refund settles with what it refunds: one that was carried to the door stays in the history.
  if (order.status === ORDER_STATUS.REFUNDED && order.deliveredAt) return 'delivered';
  return 'cancelled';
}

/** Each pile newest first; orders placed at the same moment keep the order they came in. */
export function splitOrders<T extends SplittableOrder>(orders: readonly T[]): OrderSplit<T> {
  const split: OrderSplit<T> = { active: [], delivered: [], cancelled: [] };
  for (const order of orders) split[segmentOf(order)].push(order);
  for (const segment of ORDER_SEGMENTS) {
    split[segment].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt) || 0);
  }
  return split;
}

/**
 * Where the tab opens: on what is live, else on the history. Cancelled leads
 * only when it is all there is; with nothing at all the empty state is a
 * different screen, and this only has to say something.
 */
export function defaultSegment(split: Record<OrderSegment, readonly unknown[]>): OrderSegment {
  return ORDER_SEGMENTS.find((segment) => split[segment].length > 0) ?? 'delivered';
}

/** The customer's tap: the pile, and whether it had orders in it when they chose it. */
export interface SegmentPick {
  segment: OrderSegment;
  filled: boolean;
}

export function pickSegment(
  segment: OrderSegment,
  split: Record<OrderSegment, readonly unknown[]>,
): SegmentPick {
  return { segment, filled: split[segment].length > 0 };
}

/**
 * What the tab shows. A pick sticks; one that ran dry under the customer's eyes
 * (the live order was just delivered) gives way to the default, which follows
 * the orders. A pile opened empty stays open: it was asked for.
 */
export function shownSegment(
  pick: SegmentPick | null,
  split: Record<OrderSegment, readonly unknown[]>,
): OrderSegment {
  if (pick && (!pick.filled || split[pick.segment].length > 0)) return pick.segment;
  return defaultSegment(split);
}
