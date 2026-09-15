/**
 * Store types: BAZAAR_STALL | SHOP | SUPERMARKET | LOCAL_POINT | ENTREPRENEUR (extensible: RESTAURANT, DARK_STORE, WAREHOUSE).
 */
export const STORE_TYPE = {
  BAZAAR_STALL: 'BAZAAR_STALL',
  SHOP: 'SHOP',
  SUPERMARKET: 'SUPERMARKET',
  LOCAL_POINT: 'LOCAL_POINT',
  ENTREPRENEUR: 'ENTREPRENEUR',
  RESTAURANT: 'RESTAURANT',
  DARK_STORE: 'DARK_STORE',
  WAREHOUSE: 'WAREHOUSE',
} as const;

export type StoreType = (typeof STORE_TYPE)[keyof typeof STORE_TYPE];

export const STORE_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED',
} as const;

export type StoreStatus = (typeof STORE_STATUS)[keyof typeof STORE_STATUS];

/** Units a bazaar seller actually quotes goods in. */
export const PRODUCT_UNIT = {
  PCS: 'PCS',
  KG: 'KG',
  G: 'G',
  L: 'L',
  ML: 'ML',
  PACK: 'PACK',
  BOX: 'BOX',
} as const;

export type ProductUnit = (typeof PRODUCT_UNIT)[keyof typeof PRODUCT_UNIT];

/** Weighed goods get repriced on the actual weight at pickup. */
export const WEIGHTED_UNITS: readonly ProductUnit[] = [PRODUCT_UNIT.KG, PRODUCT_UNIT.G];
