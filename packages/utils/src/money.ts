/**
 * UZS formatting / parsing.
 */
import {
  CURRENCY_MINOR_UNITS,
  CURRENCY_SYMBOL,
  DEFAULT_CURRENCY,
  type Currency,
} from '@bazar/constants';

/**
 * Money is always an integer in minor units (tiyin). Floats never touch a price.
 * These helpers only convert for display and for parsing user input.
 */
const factor = (currency: Currency): number => 10 ** CURRENCY_MINOR_UNITS[currency];

/** 1234567 tiyin -> "12 345,67 soum" (uz/ru use a space as the thousands separator). */
export function formatMoney(
  minor: number,
  currency: Currency = DEFAULT_CURRENCY,
  locale = 'ru-RU',
): string {
  const digits = CURRENCY_MINOR_UNITS[currency];
  const value = minor / factor(currency);
  // UZS prices are large and never quoted with tiyin in the wild.
  const fractionDigits = currency === 'UZS' ? 0 : digits;
  // Soʻm is written "17 698" in every language; the locale only picks the word.
  const formatted = new Intl.NumberFormat(currency === 'UZS' ? 'ru-RU' : locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  // "сум" is Cyrillic; Uzbek Latin readers expect "soʻm".
  const symbol = currency === 'UZS' && locale.startsWith('uz') ? 'soʻm' : CURRENCY_SYMBOL[currency];
  return `${formatted} ${symbol}`;
}

/** "12 345,67" / "12345.67" -> minor units. Returns null on garbage input. */
export function parseMoney(input: string, currency: Currency = DEFAULT_CURRENCY): number | null {
  const cleaned = input.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * factor(currency));
}

/** Major units (soum) -> minor units (tiyin). */
export const toMinor = (major: number, currency: Currency = DEFAULT_CURRENCY): number =>
  Math.round(major * factor(currency));

export const toMajor = (minor: number, currency: Currency = DEFAULT_CURRENCY): number =>
  minor / factor(currency);
