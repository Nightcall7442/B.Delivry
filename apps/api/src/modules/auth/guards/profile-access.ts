/**
 * Which profiles a person may still act through.
 *
 * `User.status` is only half of an account: the customer, courier and vendor profiles carry their own
 * flags (blockedAt, suspended, not yet verified), and none of them stopped anyone while the profile id
 * simply rode on the token. Every token is built from these, and the services use the same predicates
 * so a decision takes hold at once instead of at the next login.
 */

/** A blocked customer cannot shop, apply as a neighbour courier or touch their profile. */
export const customerMayShop = (customer: { blockedAt: Date | null }): boolean =>
  customer.blockedAt === null;

/** A courier works only once the desk has verified them, and not while suspended. */
export const courierMayWork = (courier: { status: string; verifiedAt: Date | null }): boolean =>
  courier.status !== 'SUSPENDED' && courier.verifiedAt !== null;

/**
 * PENDING stays: a new seller must be able to open the cabinet while the desk looks at them (their
 * stalls stay invisible until approval). Suspension and rejection are the desk saying no.
 */
export const vendorMayTrade = (vendor: { status: string }): boolean =>
  vendor.status !== 'SUSPENDED' && vendor.status !== 'REJECTED';

export interface ProfileRows {
  customer: { id: string; blockedAt: Date | null } | null;
  courier: { id: string; status: string; verifiedAt: Date | null } | null;
  vendor: { id: string; status: string } | null;
}

export interface ProfileIds {
  customerId: string | null;
  courierId: string | null;
  vendorId: string | null;
}

/** The profile ids a token may carry: a profile the desk has shut is left off, never "the desk". */
export function activeProfileIds(rows: ProfileRows): ProfileIds {
  return {
    customerId: rows.customer !== null && customerMayShop(rows.customer) ? rows.customer.id : null,
    courierId: rows.courier !== null && courierMayWork(rows.courier) ? rows.courier.id : null,
    vendorId: rows.vendor !== null && vendorMayTrade(rows.vendor) ? rows.vendor.id : null,
  };
}
