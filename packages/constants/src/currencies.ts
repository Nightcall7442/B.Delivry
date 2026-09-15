/**
 * Supported currencies (UZS default; ISO 4217 codes, minor units).
 */
export const CURRENCY = {
  UZS: 'UZS',
  USD: 'USD',
  RUB: 'RUB',
} as const;

export type Currency = (typeof CURRENCY)[keyof typeof CURRENCY];

export const DEFAULT_CURRENCY: Currency = CURRENCY.UZS;

/** Digits after the decimal point. UZS is quoted in tiyin (1/100) like the others. */
export const CURRENCY_MINOR_UNITS: Record<Currency, number> = {
  UZS: 2,
  USD: 2,
  RUB: 2,
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  // Russian notation: it is what every Uzbek storefront prints, and ru is the default locale.
  UZS: 'сум',
  USD: '$',
  RUB: 'RUB',
};
