/**
 * Which side of an order the caller is on.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { PERMISSION } from '@bazar/constants';

/** What a caller is to one order: its customer, its stall's vendor, or the desk. */
export interface OrderStanding {
  /** Staff see and move every order of the tenant (operators, admins). */
  staff: boolean;
  /** The vendor that owns the stall the order was placed with: their own orders, nobody else's. */
  store: boolean;
  customer: boolean;
}

/**
 * True when the caller reaches this order only as the stall it was placed with: not the desk, not
 * the customer, not the courier carrying it. That view is for gathering the goods — it must not
 * carry the customer's phone, door or route (see toOrderDto and the tracking view).
 */
export function isStallOnlyView(
  user: AuthenticatedUser,
  order: { customerId: string; courierId: string | null; store: { vendorId: string } },
): boolean {
  const standing = standingOn(user, order);
  const ownCourier = user.courierId !== undefined && user.courierId === order.courierId;
  return standing.store && !standing.staff && !standing.customer && !ownCourier;
}

/**
 * The permission checks say what a role may do; this says to which orders. Without it a route that
 * only asks for `order:update` lets any vendor confirm, move or cancel the orders of every other
 * stall, because the vendor role holds that permission for all of them.
 */
export function standingOn(
  user: AuthenticatedUser,
  order: { customerId: string; store: { vendorId: string } },
): OrderStanding {
  return {
    staff: user.permissions.includes(PERMISSION.ORDER_READ_ANY),
    store: user.vendorId !== undefined && user.vendorId === order.store.vendorId,
    customer: user.customerId !== undefined && user.customerId === order.customerId,
  };
}
