/**
 * Money arithmetic helpers (integer-safe).
 */
import { DEFAULT_CURRENCY, type Currency } from '@bazar/constants';
import type { Money } from './types.js';

export class CurrencyMismatchError extends Error {
  override readonly name = 'CurrencyMismatchError';
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} with ${b}`);
  }
}

export const money = (amount: number, currency: Currency = DEFAULT_CURRENCY): Money => {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Money must be an integer in minor units, got ${amount}`);
  }
  return { amount, currency };
};

export const zero = (currency: Currency = DEFAULT_CURRENCY): Money => money(0, currency);

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export const multiply = (a: Money, factor: number): Money =>
  money(Math.round(a.amount * factor), a.currency);

/** Percentages (commission, discount) round half-up to the minor unit. */
export const percentage = (a: Money, percent: number): Money =>
  money(Math.round((a.amount * percent) / 100), a.currency);

export function sumMoney(items: readonly Money[], currency: Currency = DEFAULT_CURRENCY): Money {
  return items.reduce<Money>((acc, item) => add(acc, item), zero(currency));
}

export const isZero = (a: Money): boolean => a.amount === 0;
export const isPositive = (a: Money): boolean => a.amount > 0;

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount === b.amount ? 0 : a.amount < b.amount ? -1 : 1;
}

/** Never let a discount push a total below zero. */
export const clampToZero = (a: Money): Money => (a.amount < 0 ? zero(a.currency) : a);

/**
 * Splits an amount into n parts without losing a single tiyin: the remainder is
 * spread one unit at a time over the first parts. Used for splitting a vendor
 * payout or a partial refund across order items.
 */
export function allocate(total: Money, parts: number): Money[] {
  if (parts < 1) throw new RangeError('parts must be >= 1');
  const base = Math.trunc(total.amount / parts);
  let remainder = total.amount - base * parts;
  return Array.from({ length: parts }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return money(base + extra, total.currency);
  });
}
