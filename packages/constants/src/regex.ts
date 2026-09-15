/**
 * Shared regex: UZ phone, plate numbers, etc.
 */

/** Normalized UZ phone: +998 followed by 9 digits. Store phones in this form only. */
export const UZ_PHONE_REGEX = /^\+998\d{9}$/;

/** What a user may actually type: with or without prefix, spaces, dashes, parens. */
export const UZ_PHONE_LOOSE_REGEX =
  /^(?:\+?998)?[\s()-]*\d{2}[\s()-]*\d{3}[\s()-]*\d{2}[\s()-]*\d{2}$/;

/** UZ plate, e.g. 01A123BC. Deliberately loose: regional formats vary. */
export const UZ_PLATE_REGEX = /^\d{2}\s?[A-Z]?\s?\d{3}\s?[A-Z]{2,3}$/i;

export const OTP_CODE_REGEX = /^\d{4,8}$/;

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Promo/coupon codes: uppercase alphanumerics, 4-32 chars. */
export const COUPON_CODE_REGEX = /^[A-Z0-9]{4,32}$/;
