/**
 * Order statuses — SINGLE SOURCE OF TRUTH.
 * Never use raw string literals for order status anywhere in the codebase.
 * Prisma enum OrderStatus must mirror this list.
 */
export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SEARCHING_COURIER: 'SEARCHING_COURIER',
  COURIER_ASSIGNED: 'COURIER_ASSIGNED',
  COURIER_ARRIVED_PICKUP: 'COURIER_ARRIVED_PICKUP',
  PICKING_UP: 'PICKING_UP',
  PICKED_UP: 'PICKED_UP',
  IN_DELIVERY: 'IN_DELIVERY',
  COURIER_ARRIVED: 'COURIER_ARRIVED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ALL_ORDER_STATUSES = Object.values(ORDER_STATUS);

/**
 * The only legal moves. Anything not listed here is a bug, not a business case.
 * Enforced by assertTransition() in modules/orders/domain/order-state-machine.ts.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  CONFIRMED: [ORDER_STATUS.SEARCHING_COURIER, ORDER_STATUS.CANCELLED],
  // No courier found in time -> FAILED, and an operator picks it up manually.
  SEARCHING_COURIER: [ORDER_STATUS.COURIER_ASSIGNED, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
  // A courier who drops the job sends the order back to the search.
  COURIER_ASSIGNED: [
    ORDER_STATUS.COURIER_ARRIVED_PICKUP,
    ORDER_STATUS.SEARCHING_COURIER,
    ORDER_STATUS.CANCELLED,
  ],
  COURIER_ARRIVED_PICKUP: [
    ORDER_STATUS.PICKING_UP,
    ORDER_STATUS.SEARCHING_COURIER,
    ORDER_STATUS.CANCELLED,
  ],
  // Goods turned out to be unavailable at the stall -> FAILED.
  PICKING_UP: [ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
  // Goods are in the courier bag: the customer can no longer cancel for free.
  PICKED_UP: [ORDER_STATUS.IN_DELIVERY, ORDER_STATUS.FAILED],
  IN_DELIVERY: [ORDER_STATUS.COURIER_ARRIVED, ORDER_STATUS.FAILED],
  // Customer not at the address / refuses the goods -> FAILED.
  COURIER_ARRIVED: [ORDER_STATUS.DELIVERED, ORDER_STATUS.FAILED],
  DELIVERED: [ORDER_STATUS.REFUNDED],
  CANCELLED: [ORDER_STATUS.REFUNDED],
  FAILED: [ORDER_STATUS.REFUNDED],
  REFUNDED: [],
};

/** No courier work left to do. Money may still move (see REFUNDED). */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.REFUNDED,
];

/** Shown in the "active orders" feed of every app. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = ALL_ORDER_STATUSES.filter(
  (status) => !TERMINAL_ORDER_STATUSES.includes(status),
);

/**
 * A customer may cancel on their own up to pickup. After PICKED_UP the goods are
 * already bought and carried, so cancellation goes through support.
 */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.SEARCHING_COURIER,
  ORDER_STATUS.COURIER_ASSIGNED,
  ORDER_STATUS.COURIER_ARRIVED_PICKUP,
];

/** Statuses a courier owns: they are the actor that moves the order forward. */
export const COURIER_DRIVEN_STATUSES: readonly OrderStatus[] = [
  ORDER_STATUS.COURIER_ASSIGNED,
  ORDER_STATUS.COURIER_ARRIVED_PICKUP,
  ORDER_STATUS.PICKING_UP,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.COURIER_ARRIVED,
];

export const isTerminalOrderStatus = (status: OrderStatus): boolean =>
  TERMINAL_ORDER_STATUSES.includes(status);

export const canTransitionOrderStatus = (from: OrderStatus, to: OrderStatus): boolean =>
  ORDER_STATUS_TRANSITIONS[from].includes(to);

/**
 * What the courier does when the stall is out of something. Chosen at
 * checkout, printed on the courier's pickup card; it removes the phone call.
 */
export const SUBSTITUTION_POLICY = {
  /** Call before changing anything. */
  CALL: 'CALL',
  /** Swap for the closest thing at the same or lower price. */
  REPLACE: 'REPLACE',
  /** Leave it out and take it off the bill. */
  REMOVE: 'REMOVE',
} as const;

export type SubstitutionPolicy = (typeof SUBSTITUTION_POLICY)[keyof typeof SUBSTITUTION_POLICY];
