/**
 * Shops next to the stalls. A stall is a person behind a counter; a shop is a
 * shelf — no owner, no motto, a logo instead of a face. Chains (Korzinka,
 * Makro) are many branches behind one shopfront: the customer sees the chain
 * once and the order goes to the branch nearest their address.
 */
import { SAME_BAZAAR_METERS, STORE_TYPE, SUBSTITUTION_POLICY } from '@bazar/constants';
import type { SubstitutionPolicy } from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import type { LatLngDto, StoreDto } from '@bazar/types';

import type { CartStoreGroup } from './cart.js';

/** The store's hours by kind: rows open at dawn and close at six; shops trade till late. */
export const HOURS = {
  stall: { opensAt: 6 * 60 + 30, closesAt: 18 * 60 },
  shop: { opensAt: 8 * 60, closesAt: 23 * 60 },
} as const;

/** Order limits a shop gets when it has none of its own (minor units). */
export const SHOP_LIMITS = { minOrder: 50_000_00, freeDeliveryThreshold: 100_000_00 } as const;

const ALWAYS_SHOP: ReadonlySet<string> = new Set([
  STORE_TYPE.SUPERMARKET,
  STORE_TYPE.DARK_STORE,
  STORE_TYPE.WAREHOUSE,
]);
const NEVER_SHOP: ReadonlySet<string> = new Set([STORE_TYPE.BAZAAR_STALL, STORE_TYPE.ENTREPRENEUR]);

/**
 * A shelf rather than a person: supermarkets always, bazaar rows never, and a
 * plain SHOP / LOCAL_POINT only while nobody is named behind its counter.
 */
export const isShopfront = (store: Pick<StoreDto, 'type' | 'ownerName'>): boolean =>
  ALWAYS_SHOP.has(store.type) || (!NEVER_SHOP.has(store.type) && store.ownerName === null);

/** Goods of the bazaar rows only — shop shelves stay behind their boards. */
export function stallGoods<T extends { storeId: string }>(
  products: readonly T[],
  stores: readonly Pick<StoreDto, 'id' | 'type' | 'ownerName'>[],
): T[] {
  const stalls = new Set(stores.filter((store) => !isShopfront(store)).map((store) => store.id));
  return products.filter((product) => stalls.has(product.storeId));
}

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

/** Today's closing time in Tashkent as «HH:MM», or null when the store does not open today. */
export function closesToday(store: Pick<StoreDto, 'schedule'>, now = new Date()): string | null {
  // Tashkent is UTC+5 all year.
  const weekday = new Date(now.getTime() + 5 * 3_600_000).getUTCDay();
  const day = store.schedule.find((row) => row.weekday === weekday);
  if (day === undefined || day.closed) return null;
  const h = Math.floor(day.closesAt / 60);
  const m = day.closesAt % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** A shop swaps a missing item for the same thing; at a stall the seller calls first. */
export const defaultSubstitution = (
  store: Pick<StoreDto, 'type' | 'ownerName'>,
): SubstitutionPolicy =>
  isShopfront(store) ? SUBSTITUTION_POLICY.REPLACE : SUBSTITUTION_POLICY.CALL;

/**
 * Cross-bazaar: the first cluster of stalls within one bazaar → one courier trip on
 * offer. Shops never share a trip — their goods come off a shelf, not a row.
 */
export function oneTrip(
  groups: readonly CartStoreGroup[],
  storeById: ReadonlyMap<string, StoreDto & { point: LatLngDto }>,
): string[] | null {
  const stalls = groups.filter((g) => {
    const store = storeById.get(g.storeId);
    return store !== undefined && !isShopfront(store);
  });
  for (const lead of stalls) {
    const leadPoint = storeById.get(lead.storeId)!.point;
    const mates = stalls.filter(
      (g) =>
        g !== lead &&
        haversineMeters(leadPoint, storeById.get(g.storeId)!.point) <= SAME_BAZAAR_METERS,
    );
    if (mates.length > 0) return [lead.storeId, ...mates.map((g) => g.storeId)];
  }
  return null;
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
