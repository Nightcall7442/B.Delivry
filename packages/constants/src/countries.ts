/**
 * Country codes & phone prefixes (UZ: +998).
 */
export const COUNTRY = {
  UZ: 'UZ',
} as const;

export type CountryCode = (typeof COUNTRY)[keyof typeof COUNTRY];

export const DEFAULT_COUNTRY: CountryCode = COUNTRY.UZ;

export const COUNTRY_PHONE_PREFIX: Record<CountryCode, string> = {
  UZ: '+998',
};

/** Digits after the prefix. UZ numbers are +998 XX XXX XX XX. */
export const COUNTRY_PHONE_LENGTH: Record<CountryCode, number> = {
  UZ: 9,
};

export const DEFAULT_TIMEZONE = 'Asia/Tashkent';
