/**
 * Business limits: max cart items, max addresses, OTP attempts, pagination sizes.
 */
export const LIMITS = {
  CART_MAX_ITEMS: 100,
  CART_MAX_QTY_PER_ITEM: 999,
  CART_TTL_HOURS: 72,

  CUSTOMER_MAX_ADDRESSES: 20,
  ORDER_MAX_ITEMS: 100,
  /** Below this a courier trip does not pay for itself (minor units). */
  ORDER_MIN_SUBTOTAL_MINOR: 5_000_00,
  /** Cancellation is free for the customer only this long after creation. */
  ORDER_FREE_CANCEL_SECONDS: 120,

  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
  OTP_MAX_PER_DAY: 10,
  LOGIN_MAX_FAILURES: 10,
  LOGIN_LOCKOUT_SECONDS: 900,
  MAX_SESSIONS_PER_USER: 10,

  UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
  PRODUCT_MAX_IMAGES: 10,

  REVIEW_MAX_LENGTH: 2000,
  SUPPORT_MESSAGE_MAX_LENGTH: 4000,
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE: 1,
} as const;

export const SEARCH_RADIUS = {
  /** Start here when looking for a courier, then widen by STEP up to MAX. */
  COURIER_INITIAL_METERS: 2_000,
  COURIER_STEP_METERS: 2_000,
  COURIER_MAX_METERS: 10_000,
  /** Stores shown to a customer by default. */
  STORE_DEFAULT_METERS: 5_000,
} as const;
