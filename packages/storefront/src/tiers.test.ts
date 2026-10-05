import { describe, expect, it } from 'vitest';
import {
  lineTotalFor,
  nextTier,
  piecePriceOfSet,
  setPriceOf,
  tierProblem,
  unitPriceFor,
} from './tiers.js';

// 18 000 a kilo; from 5 kg 17 000, from 10 kg 16 000.
const LIST = 18_000_00;
const WHOLESALE = [
  { minQuantity: 10, price: 16_000_00 },
  { minQuantity: 5, price: 17_000_00 },
];

describe('a quantity price', () => {
  it('prices the whole line at the deepest tier reached', () => {
    expect(unitPriceFor(LIST, WHOLESALE, 4.5)).toBe(LIST);
    expect(unitPriceFor(LIST, WHOLESALE, 5)).toBe(17_000_00);
    expect(unitPriceFor(LIST, WHOLESALE, 12)).toBe(16_000_00);
    expect(lineTotalFor(LIST, WHOLESALE, 10)).toBe(160_000_00);
    expect(lineTotalFor(LIST, [], 0.5)).toBe(9_000_00);
  });

  it('is never above the list price: a sale cut below a tier wins', () => {
    expect(unitPriceFor(15_000_00, WHOLESALE, 12)).toBe(15_000_00);
  });

  it('says what the next step would give, and nothing at the top', () => {
    expect(nextTier(LIST, WHOLESALE, 3)).toEqual({ minQuantity: 5, price: 17_000_00 });
    expect(nextTier(LIST, WHOLESALE, 7)).toEqual({ minQuantity: 10, price: 16_000_00 });
    expect(nextTier(LIST, WHOLESALE, 10)).toBeNull();
  });

  it('«3 шт за 10 000»: a piece rounded down, the set never above the label', () => {
    const piece = piecePriceOfSet(10_000_00, 3);
    expect(piece).toBe(333_333);
    const set = { minQuantity: 3, price: piece };
    expect(lineTotalFor(4_000_00, [set], 3)).toBeLessThanOrEqual(10_000_00);
    // The label reads back as typed, to the sum.
    expect(Math.round(setPriceOf(set) / 100)).toBe(10_000);
  });

  it('stands only as a short ladder down, from above the smallest order and under the list', () => {
    const product = { price: LIST, minQuantity: 0.5 };
    expect(tierProblem(WHOLESALE, product)).toBeNull();
    expect(tierProblem([], product)).toBeNull();
    expect(
      tierProblem(
        [1, 2, 3, 4].map((q) => ({ minQuantity: q * 5, price: LIST - q * 100 })),
        product,
      ),
    ).toBe('tooMany');
    expect(tierProblem([{ minQuantity: 0.5, price: 17_000_00 }], product)).toBe('quantity');
    expect(tierProblem([{ minQuantity: 5, price: LIST }], product)).toBe('price');
    expect(tierProblem([{ minQuantity: 5, price: 17_000_00.5 }], product)).toBe('price');
    // As the database keeps it: to the thousandth, and whole for counted goods.
    expect(tierProblem([{ minQuantity: 1.0004, price: 17_000_00 }], product)).toBe('quantity');
    expect(tierProblem([{ minQuantity: 1.005, price: 17_000_00 }], product)).toBeNull();
    expect(
      tierProblem([{ minQuantity: 2.5, price: 3_000_00 }], {
        price: 4_000_00,
        minQuantity: 1,
        whole: true,
      }),
    ).toBe('quantity');
    // More for less: 10 kg must not cost more per kilo than 5 kg.
    expect(
      tierProblem(
        [
          { minQuantity: 5, price: 16_000_00 },
          { minQuantity: 10, price: 17_000_00 },
        ],
        product,
      ),
    ).toBe('order');
    expect(
      tierProblem(
        [
          { minQuantity: 5, price: 17_000_00 },
          { minQuantity: 5, price: 16_000_00 },
        ],
        product,
      ),
    ).toBe('order');
  });
});

describe('a quantity price in words', async () => {
  const { createT } = await import('@bazar/i18n');
  const { nextTierText, onTier, tierTexts } = await import('./tier-labels.js');
  const ru = createT('ru');
  // Sums are set with no-break spaces; the test reads them as plain ones.
  const plain = (text: string | null) => text?.replace(/[\u00a0\u202f]/g, ' ') ?? null;
  const t = Object.assign((key: never, params?: never) => plain(ru(key, params)) ?? '', ru, {
    money: (minor: number, currency?: never) => plain(ru.money(minor, currency)) ?? '',
  }) as unknown as typeof ru;
  const good = (unit: 'KG' | 'PCS', price: number, tiers: [number, number][]) =>
    ({
      unit,
      price: { amount: price, currency: 'UZS' },
      priceTiers: tiers.map(([minQuantity, amount]) => ({
        minQuantity,
        price: { amount, currency: 'UZS' },
      })),
    }) as never;

  it('reads by the kilo for weighed goods and by the set for counted ones', () => {
    const tomatoes = good('KG', LIST, [
      [5, 17_000_00],
      [10, 16_000_00],
    ]);
    expect(tierTexts(t, 'ru', tomatoes)).toEqual([
      'от 5 кг — 17 000 сум / кг',
      'от 10 кг — 16 000 сум / кг',
    ]);
    expect(nextTierText(t, 'ru', tomatoes, 7.5)).toBe('Ещё 2,5 кг — и по 16 000 сум / кг');
    expect(nextTierText(t, 'ru', tomatoes, 10)).toBeNull();
    expect(onTier(tomatoes, 5)).toBe(true);
    expect(onTier(tomatoes, 4)).toBe(false);

    const melons = good('PCS', 4_000_00, [[3, piecePriceOfSet(10_000_00, 3)]]);
    expect(tierTexts(t, 'ru', melons)).toEqual(['3 шт за 10 000 сум']);
    expect(nextTierText(t, 'ru', melons, 1)).toBe('Возьмите 3 шт — 10 000 сум за все');
  });
});
