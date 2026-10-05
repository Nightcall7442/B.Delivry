/**
 * Favorites module-internal types.
 */

/** A saved heart points at a good or at a stall, never both. */
export type FavoriteKind = 'product' | 'store';

/** What the customer has saved, newest first. */
export interface FavoriteIds {
  productIds: string[];
  storeIds: string[];
}
