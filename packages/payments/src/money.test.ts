/**
 * Money arithmetic. Every failure here is a wrong charge, so the cases are
 * the ones that actually go wrong: rounding, splitting, and currency mixing.
 */
import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  add,
  allocate,
  clampToZero,
  compare,
  money,
  multiply,
  percentage,
  subtract,
  sumMoney,
} from './money.js';

const uzs = (amount: number) => money(amount, 'UZS');

describe('money', () => {
  it('refuses a non-integer amount', () => {
    expect(() => uzs(10.5)).toThrow(TypeError);
  });

  it('refuses to combine different currencies', () => {
    expect(() => add(uzs(100), money(100, 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('adds and subtracts without drift', () => {
    expect(add(uzs(1_999_99), uzs(1)).amount).toBe(2_000_00);
    expect(subtract(uzs(2_000_00), uzs(1)).amount).toBe(1_999_99);
  });

  it('rounds a fractional multiply to the minor unit', () => {
    // 2.345 kg of something priced at 12 345 tiyin per kg.
    expect(multiply(uzs(12_345), 2.345).amount).toBe(Math.round(12_345 * 2.345));
    expect(Number.isInteger(multiply(uzs(333), 1 / 3).amount)).toBe(true);
  });

  it('computes a percentage without floating tails', () => {
    expect(percentage(uzs(100_00), 10).amount).toBe(10_00);
    expect(Number.isInteger(percentage(uzs(33_333), 7.5).amount)).toBe(true);
  });

  it('clamps a negative total to zero', () => {
    expect(clampToZero(uzs(-500)).amount).toBe(0);
    expect(clampToZero(uzs(500)).amount).toBe(500);
  });

  it('sums an empty list to zero rather than throwing', () => {
    expect(sumMoney([], 'UZS').amount).toBe(0);
  });

  it('orders amounts', () => {
    expect(compare(uzs(100), uzs(200))).toBe(-1);
    expect(compare(uzs(200), uzs(200))).toBe(0);
    expect(compare(uzs(300), uzs(200))).toBe(1);
  });
});

describe('allocate', () => {
  it('splits evenly when it divides', () => {
    const parts = allocate(uzs(900), 3);
    expect(parts.map((part) => part.amount)).toEqual([300, 300, 300]);
  });

  it('loses nothing when it does not divide', () => {
    const parts = allocate(uzs(100), 3);

    // The remainder is spread one tiyin at a time over the first parts.
    expect(parts.map((part) => part.amount)).toEqual([34, 33, 33]);
    expect(parts.reduce((sum, part) => sum + part.amount, 0)).toBe(100);
  });

  it('always sums back to the original, for any split', () => {
    for (const total of [1, 7, 99, 100_00, 123_456_78]) {
      for (const parts of [1, 2, 3, 7, 13]) {
        const split = allocate(uzs(total), parts);
        expect(split).toHaveLength(parts);
        expect(split.reduce((sum, part) => sum + part.amount, 0)).toBe(total);
      }
    }
  });

  it('refuses a nonsensical split', () => {
    expect(() => allocate(uzs(100), 0)).toThrow(RangeError);
  });
});
