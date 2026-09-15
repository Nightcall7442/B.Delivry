/**
 * The two public promises. Numbers, not prose: the prose lives in @bazar/i18n.
 */
export const GUARANTEE = {
  /** Later than this past the promised time, the delivery fee comes back. */
  LATE_TOLERANCE_MINUTES: 20,
  /** How long after delivery a freshness complaint is accepted. */
  FRESHNESS_WINDOW_HOURS: 2,
  /** A slot order is promised by the end of its window. */
  SLOT_WINDOW_MINUTES: 120,
} as const;

/**
 * Delivery windows start at these local hours (each two hours long), and a
 * subscription's order is placed this long before its window opens.
 */
export const DELIVERY_SLOT_HOURS = [8, 12, 18] as const;
export const SUBSCRIPTION_LEAD_MINUTES = 120;

/** Bazar Plus: one price, one period. Minor units. */
export const PLUS = { PRICE_MINOR: 2_900_000, DAYS: 30 } as const;
/** Cashback on every delivered order, in percent of the goods, valid this many days. */
export const CASHBACK = { PERCENT: 3, EXPIRES_DAYS: 30 } as const;
/** Both sides of a referral get this once the newcomer's first order is delivered. */
export const REFERRAL_BONUS_MINOR = 1_000_000;

/** Haggling: how long an ask waits for the vendor, how long an agreed price holds, the floor. */
export const HAGGLE = {
  ASK_TTL_HOURS: 4,
  PRICE_TTL_HOURS: 24,
  /** Nobody asks for a tomato at one soum: the ask must be at least this share of the price. */
  MIN_SHARE: 0.5,
} as const;

/** Paid placement for a store: first on the home list with a «Реклама» label. */
export const PROMOTION = { PRICE_MINOR: 4_900_000, DAYS: 7 } as const;

/** Mahalla couriers: neighbours on foot, offered orders ending near their home. */
export const NEIGHBOUR_COURIER = { HOME_RADIUS_METERS: 1_500 } as const;

/** Cross-bazaar: stalls this close share one courier trip and one delivery fee. */
export const SAME_BAZAAR_METERS = 400;

/** Badges a vendor may put on a store or a product. */
export const STORE_TAG = {
  ECO: 'eco',
  HALAL: 'halal',
  HOMEMADE: 'homemade',
  GIFT: 'gift',
} as const;
export type StoreTag = (typeof STORE_TAG)[keyof typeof STORE_TAG];
