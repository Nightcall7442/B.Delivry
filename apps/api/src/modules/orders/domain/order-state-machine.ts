/**
 * Order state machine: allowed transitions map + assertTransition(). Statuses from @bazar/constants.
 */
import {
  ACTIVE_ORDER_STATUSES,
  COURIER_DRIVEN_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  type OrderStatus,
} from '@bazar/constants';
import { InvalidStateTransitionError } from '../../../common/errors/domain.errors.js';

/**
 * The transition table itself lives in @bazar/constants so the admin UI can
 * render the same graph the API enforces. This module is the enforcement: no
 * status is written anywhere without passing through assertTransition.
 */
export const ORDER_TRANSITIONS = ORDER_STATUS_TRANSITIONS;

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_TRANSITIONS[from].includes(to);

/** Throws InvalidStateTransitionError naming both ends, for the audit trail. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidStateTransitionError(from, to);
}

export const isTerminal = (status: OrderStatus): boolean =>
  TERMINAL_ORDER_STATUSES.includes(status);

export const isActive = (status: OrderStatus): boolean => ACTIVE_ORDER_STATUSES.includes(status);

/**
 * Who is allowed to make a given move. The transition table says what is
 * physically possible; this says who may ask for it, which is a different
 * question: a customer cannot mark their own order DELIVERED.
 */
export type Actor = 'customer' | 'courier' | 'store' | 'staff' | 'system';

export function canActorTransition(actor: Actor, from: OrderStatus, to: OrderStatus): boolean {
  if (!canTransition(from, to)) return false;

  switch (actor) {
    case 'staff':
    case 'system':
      // Operators are the escape hatch when something goes wrong on the street.
      return true;
    case 'customer':
      return to === ORDER_STATUS.CANCELLED && CUSTOMER_CANCELLABLE_STATUSES.includes(from);
    case 'courier':
      // DELIVERED is listed explicitly: it is the courier's single most
      // important action, and it is not a "courier-driven status" because the
      // order stops being theirs the moment it lands.
      return (
        COURIER_DRIVEN_STATUSES.includes(to) ||
        to === ORDER_STATUS.DELIVERED ||
        to === ORDER_STATUS.FAILED
      );
    case 'store':
      // The stall confirms it can gather the goods, or reports it cannot.
      return to === ORDER_STATUS.CONFIRMED || to === ORDER_STATUS.FAILED;
    default:
      return false;
  }
}

export function assertActorTransition(actor: Actor, from: OrderStatus, to: OrderStatus): void {
  assertTransition(from, to);
  if (!canActorTransition(actor, from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/**
 * The status a courier action moves the order to. Keeps the courier API in
 * verbs ("I arrived", "I picked it up") instead of making the client know the
 * status names.
 */
export const COURIER_ACTION_STATUS = {
  arrived_pickup: ORDER_STATUS.COURIER_ARRIVED_PICKUP,
  picking_up: ORDER_STATUS.PICKING_UP,
  picked_up: ORDER_STATUS.PICKED_UP,
  in_delivery: ORDER_STATUS.IN_DELIVERY,
  arrived: ORDER_STATUS.COURIER_ARRIVED,
  delivered: ORDER_STATUS.DELIVERED,
  // The goods are not there (sold out, shop closed): the order ends and, if paid, is refunded.
  failed: ORDER_STATUS.FAILED,
} as const;

export type CourierAction = keyof typeof COURIER_ACTION_STATUS;

/** Next status a courier would normally move to, for a one-tap UI. */
export function nextCourierStatus(current: OrderStatus): OrderStatus | null {
  const forward = ORDER_TRANSITIONS[current].find(
    (status) => COURIER_DRIVEN_STATUSES.includes(status) || status === ORDER_STATUS.DELIVERED,
  );
  return forward ?? null;
}
