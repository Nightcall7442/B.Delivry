/**
 * «Избранное»: what the customer saved. Ids only — the storefront reads the goods and stalls
 * through its usual calls, so a hidden stall shows nothing rather than a stale card.
 */
import type { Id } from './common.js';

export interface FavoritesDto {
  /** Newest first. */
  productIds: Id[];
  storeIds: Id[];
}
