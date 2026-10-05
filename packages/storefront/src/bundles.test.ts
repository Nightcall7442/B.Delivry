import type { ProductDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';
import { bundleGuests, getBundle, resolveBundle, sellableQuantity, stepGuests } from './bundles.js';

/** A good as the seed sells it: weighed ones by the half kilo, counted ones by the piece. */
function good(slug: string, price: number, unit: ProductDto['unit'], step = 0.5): ProductDto {
  return {
    id: slug,
    slug,
    storeId: 'st1',
    unit,
    price: { amount: price, currency: 'UZS' },
    oldPrice: null,
    quantityStep: unit === 'KG' ? step : 1,
    minQuantity: unit === 'KG' ? step : 1,
    available: true,
    priceTiers: [],
  } as unknown as ProductDto;
}

const SHELF = [
  good('p-lamb', 135_000_00, 'KG'),
  good('p-rice', 38_000_00, 'KG'),
  good('p-carrot', 6_500_00, 'KG'),
  good('p-onion', 7_000_00, 'KG'),
  good('p-oil', 26_000_00, 'L'),
  good('p-zira', 8_000_00, 'PACK'),
  good('p-raisin', 42_000_00, 'KG'),
];
const plov = getBundle('plov')!;
const qty = (guests: number) =>
  Object.fromEntries(
    resolveBundle(plov, SHELF, guests).lines.map((line) => [line.product.slug, line.quantity]),
  );

describe('«Ош на N человек»', () => {
  it('cooks the kazan’s rule for six: a kilo each of meat, rice and carrots', () => {
    expect(qty(6)).toEqual({
      'p-lamb': 1,
      'p-rice': 1,
      'p-carrot': 1,
      'p-onion': 0.5,
      'p-oil': 1,
      'p-zira': 1,
      // 200 g is under the stall's half kilo: the set takes what the stall sells.
      'p-raisin': 0.5,
    });
  });

  it('grows with the company, rounded up to what the stall sells', () => {
    expect(qty(12)).toMatchObject({ 'p-lamb': 2, 'p-rice': 2, 'p-carrot': 2, 'p-onion': 1 });
    // 8 guests: 1.33 kg is 1.5 at a stall that sells by the half kilo.
    expect(qty(8)).toMatchObject({ 'p-lamb': 1.5, 'p-rice': 1.5, 'p-onion': 1 });
    expect(qty(3)).toMatchObject({ 'p-lamb': 0.5, 'p-onion': 0.5 });
  });

  it('does not buy a pack of cumin or a litre of oil for every few guests', () => {
    expect(qty(30)).toMatchObject({ 'p-zira': 1, 'p-oil': 2, 'p-lamb': 5 });
    expect(qty(31)).toMatchObject({ 'p-zira': 2, 'p-oil': 3 });
  });

  it('says what one guest costs', () => {
    const resolved = resolveBundle(plov, SHELF, 12);
    expect(resolved.guests).toBe(12);
    expect(resolved.perGuest).toBe(Math.round(resolved.total / 12 / 10_000) * 10_000);
    expect(resolved.perGuest % 10_000).toBe(0);
  });

  it('keeps the company within the set’s range, and a fixed set at its own', () => {
    expect(bundleGuests(plov, 12)).toBe(12);
    expect(bundleGuests(plov, 0)).toBe(2);
    expect(bundleGuests(plov, 5000)).toBe(100);
    expect(bundleGuests(plov, Number.NaN)).toBe(6);
    expect(bundleGuests(plov, undefined)).toBe(6);
    expect(bundleGuests(getBundle('samsa-tea')!, 10)).toBe(2);
  });

  it('rounds a quantity up to the step, never under the minimum', () => {
    const halfKilo = { quantityStep: 0.5, minQuantity: 0.5 };
    expect(sellableQuantity(halfKilo, 1.5)).toBe(1.5);
    expect(sellableQuantity(halfKilo, 1.51)).toBe(2);
    expect(sellableQuantity(halfKilo, 0.1)).toBe(0.5);
    expect(sellableQuantity({ quantityStep: 0.1, minQuantity: 0.3 }, 0.25)).toBe(0.3);
    expect(sellableQuantity({ quantityStep: 0.1, minQuantity: 0.1 }, 0.7000001)).toBe(0.7);
  });
});

describe('the set’s name for the company', () => {
  it('says the dish and the guests in the language’s order', async () => {
    const { createT } = await import('@bazar/i18n');
    const { bundleTitle } = await import('./bundles.js');
    expect(bundleTitle(createT('ru'), plov, 12)).toBe('Плов на 12 человек');
    expect(bundleTitle(createT('ru'), plov, 2)).toBe('Плов на 2 человека');
    expect(bundleTitle(createT('uz'), plov, 12)).toBe('12 kishilik osh');
    expect(bundleTitle(createT('ru'), getBundle('samsa-tea')!, 2)).toBe('Самса к чаю');
  });
});

describe('the guest stepper', () => {
  it('goes one by one up to twenty, then by fives, within the range', () => {
    expect(stepGuests(plov, 6, 1)).toBe(7);
    expect(stepGuests(plov, 19, 1)).toBe(20);
    expect(stepGuests(plov, 20, 1)).toBe(25);
    expect(stepGuests(plov, 23, 1)).toBe(25);
    expect(stepGuests(plov, 25, -1)).toBe(20);
    expect(stepGuests(plov, 20, -1)).toBe(19);
    expect(stepGuests(plov, 2, -1)).toBe(2);
    expect(stepGuests(plov, 100, 1)).toBe(100);
  });
});
