/**
 * Shops next to the stalls. A stall is a person behind a counter; a shop is a
 * shelf — no owner, no motto, a logo instead of a face. Chains (Korzinka,
 * Makro) are many branches behind one shopfront: the customer sees the chain
 * once and the order goes to the branch nearest their address.
 */
import { STORE_TYPE } from '@bazar/constants';
import type { LatLngDto, StoreDto } from '@bazar/types';

import { haversineMeters } from '@bazar/maps';

/** The store's hours by kind: rows open at dawn and close at six; shops trade till late. */
export const HOURS = {
  stall: { opensAt: 6 * 60 + 30, closesAt: 18 * 60 },
  shop: { opensAt: 8 * 60, closesAt: 23 * 60 },
} as const;

/** Order limits a shop gets when it has none of its own (minor units). */
export const SHOP_LIMITS = { minOrder: 50_000_00, freeDeliveryThreshold: 100_000_00 } as const;

/** No person behind the counter and not a bazaar row → a shelf, drawn as a shopfront. */
export const isShopfront = (store: Pick<StoreDto, 'type' | 'ownerName'>): boolean =>
  store.ownerName === null &&
  store.type !== STORE_TYPE.BAZAAR_STALL &&
  store.type !== STORE_TYPE.ENTREPRENEUR;

/** The stores of a bazaar row: everything that is not a shopfront. */
export const isStall = (store: Pick<StoreDto, 'type' | 'ownerName'>): boolean =>
  !isShopfront(store);

/**
 * One entry per chain: the branch nearest the address (or the first one when
 * there is no address yet); single shops pass through. Order is kept.
 */
export function shopfronts<T extends StoreDto & { point: LatLngDto }>(
  stores: readonly T[],
  near: LatLngDto | null,
): T[] {
  const out: T[] = [];
  const seen = new Map<string, number>();
  for (const store of stores) {
    if (!isShopfront(store)) continue;
    if (store.chainSlug === null) {
      out.push(store);
      continue;
    }
    const index = seen.get(store.chainSlug);
    if (index === undefined) {
      seen.set(store.chainSlug, out.length);
      out.push(store);
    } else if (near !== null) {
      const current = out[index]!;
      if (haversineMeters(store.point, near) < haversineMeters(current.point, near)) {
        out[index] = store;
      }
    }
  }
  return out;
}

/** All branches of the store's chain, nearest first; a single shop is its own list. */
export function branchesOf<T extends StoreDto & { point: LatLngDto }>(
  store: T,
  stores: readonly T[],
  near: LatLngDto | null,
): T[] {
  const branches =
    store.chainSlug === null ? [store] : stores.filter((s) => s.chainSlug === store.chainSlug);
  if (near === null) return branches;
  return [...branches].sort(
    (a, b) => haversineMeters(a.point, near) - haversineMeters(b.point, near),
  );
}
