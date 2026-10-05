import { describe, expect, it } from 'vitest';

import { dealsOf, discountPercent } from './sales.js';

const som = (n: number) => ({ amount: n * 100, currency: 'UZS' as const });
const good = (
  id: string,
  storeId: string,
  price: number,
  old: number | null,
  available = true,
) => ({
  id,
  storeId,
  available,
  price: som(price),
  oldPrice: old === null ? null : som(old),
});

describe('discountPercent', () => {
  it('rounds the cut to whole percent', () => {
    expect(discountPercent(good('a', 's', 36_000, 45_000))).toBe(20);
    expect(discountPercent(good('a', 's', 9_990, 12_000))).toBe(17);
  });

  it('is 0 without a struck-through price, or with one that is not above the price', () => {
    expect(discountPercent(good('a', 's', 10_000, null))).toBe(0);
    expect(discountPercent(good('a', 's', 10_000, 10_000))).toBe(0);
    expect(discountPercent(good('a', 's', 12_000, 10_000))).toBe(0);
  });
});

describe('dealsOf', () => {
  it('puts the deepest cut first and leaves out what is not on sale or sold out', () => {
    const deals = dealsOf([
      good('small', 's1', 9_000, 10_000),
      good('none', 's1', 9_000, null),
      good('deep', 's2', 5_000, 10_000),
      good('gone', 's3', 1_000, 10_000, false),
    ]);
    expect(deals.map((d) => d.id)).toEqual(['deep', 'small']);
  });

  it('takes at most a few from one stall, and stops at the limit', () => {
    const many = Array.from({ length: 6 }, (_, i) => good(`a${i}`, 'big', 5_000 + i, 10_000));
    const deals = dealsOf([...many, good('other', 'small', 8_000, 10_000)], {
      perStall: 2,
      limit: 3,
    });
    expect(deals.map((d) => d.id)).toEqual(['a0', 'a1', 'other']);
  });
});
