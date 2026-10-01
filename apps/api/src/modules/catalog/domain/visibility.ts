/**
 * What the shop window shows to whom. A vendor holds `store:write` and `product:write` for the whole
 * tenant, and `GET /stores` and `GET /products` took the caller's own filters at face value, so a
 * stall that is still in review, suspended or only a draft (and its owner) was a query string away
 * from anyone. The rule lives here once, and the repositories read the viewer from the ambient
 * request context — the same way they read the tenant — because a forgotten argument is a leak.
 */
import { PERMISSION, type StoreStatus } from '@bazar/constants';
import type { Prisma } from '@prisma/client';
import { getContext } from '../../../common/tenant/tenant-context.js';

/** Live, or closed for now. DRAFT, PENDING_REVIEW and SUSPENDED are the platform's and the owner's business. */
export const PUBLIC_STORE_STATUSES: readonly StoreStatus[] = ['ACTIVE', 'CLOSED'];

export const isPublicStoreStatus = (status: string): boolean =>
  (PUBLIC_STORE_STATUSES as readonly string[]).includes(status);

export interface Viewer {
  /** The desk (operators, admins) or a job: sees everything the tenant has. */
  staff: boolean;
  /** A vendor also sees their own stalls and goods in any state; absent = no vendor profile on the token. */
  vendorId?: string | undefined;
}

/** Nobody signed in, or a context that says nothing: the public. */
export const ANONYMOUS: Viewer = { staff: false };

/**
 * The desk is whoever may read every order (`order:read_any` is the one staff marker); a token
 * without a vendorId is not a vendor, and is never read as "the desk".
 */
export function currentViewer(): Viewer {
  const context = getContext();
  if (context === undefined) return ANONYMOUS;
  if (context.system === true) return { staff: true };
  const user = context.user;
  if (user === null || user === undefined) return ANONYMOUS;
  return {
    staff: user.permissions.includes(PERMISSION.ORDER_READ_ANY),
    ...(user.vendorId !== undefined ? { vendorId: user.vendorId } : {}),
  };
}

/** A vendor the platform has suspended or rejected: its stalls are shut, whatever their own status says. */
export const SHUT_VENDOR_STATUSES = ['SUSPENDED', 'REJECTED'] as const;

const liveStore = (): Prisma.StoreWhereInput => ({
  deletedAt: null,
  status: { in: [...PUBLIC_STORE_STATUSES] },
  vendor: { status: { notIn: [...SHUT_VENDOR_STATUSES] } },
});

const ownStore = (vendorId: string): Prisma.StoreWhereInput => ({ deletedAt: null, vendorId });

/** The stalls this viewer may see. Filters of a request can only narrow this, never widen it. */
export function visibleStoreWhere(viewer: Viewer): Prisma.StoreWhereInput {
  if (viewer.staff) return {};
  return viewer.vendorId === undefined
    ? liveStore()
    : { OR: [liveStore(), ownStore(viewer.vendorId)] };
}

/** The same rule for one stall already in hand. */
export function canSeeStore(
  store: { status: string; vendorId: string; deletedAt?: Date | null },
  viewer: Viewer,
): boolean {
  if (viewer.staff) return true;
  if (store.deletedAt !== undefined && store.deletedAt !== null) return false;
  if (isPublicStoreStatus(store.status)) return true;
  return viewer.vendorId !== undefined && viewer.vendorId === store.vendorId;
}

/**
 * Goods this viewer may see: those of a stall the public may see (on sale, unless `soldOutToo`:
 * the basket asks for its lines by id, sold-out ones included, so every line can be priced) and,
 * for a vendor, everything of their own stalls in any state.
 */
export function visibleProductWhere(
  viewer: Viewer,
  options: { soldOutToo: boolean },
): Prisma.ProductWhereInput {
  if (viewer.staff) return {};
  const publicly: Prisma.ProductWhereInput = {
    store: liveStore(),
    ...(options.soldOutToo ? {} : { available: true }),
  };
  return viewer.vendorId === undefined
    ? publicly
    : { OR: [publicly, { store: ownStore(viewer.vendorId) }] };
}

/** Goods of live stalls only: what an order or a basket line can be made from, for anyone. */
export const purchasableStoreWhere = liveStore;
