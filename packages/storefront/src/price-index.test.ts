import { describe, expect, it } from 'vitest';
import { createT } from '@bazar/i18n';
import {
  basketItemOf,
  changeText,
  buildPriceIndex,
  median,
  priceAt,
  sparkPath,
  trendOf,
  type IndexedGood,
} from './price-index.js';

const NOW = new Date('2026-10-05T09:00:00Z');
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function good(over: Partial<IndexedGood> & Pick<IndexedGood, 'nameRu' | 'price'>): IndexedGood {
  return {
    unit: 'KG',
    currency: 'UZS',
    storeId: 's1',
    shop: false,
    createdAt: daysAgo(60),
    history: [],
    ...over,
  };
}

describe('the basket', () => {
  it('takes a good by the start of its name and its unit', () => {
    expect(basketItemOf('Картофель', 'KG')?.key).toBe('potatoes');
    expect(basketItemOf('Лук репчатый', 'KG')?.key).toBe('onions');
    expect(basketItemOf('Морковь жёлтая, для плова', 'KG')?.key).toBe('carrots');
    expect(basketItemOf('Помидоры бакинские', 'KG')?.key).toBe('tomatoes');
    expect(basketItemOf('Курица охлаждённая', 'KG')?.key).toBe('chicken');
    expect(basketItemOf('Яйца С1, 10 шт', 'PCS')?.key).toBe('eggs');
    expect(basketItemOf('Обі нон, тандырный', 'PCS')?.key).toBe('bread');
    expect(basketItemOf('Лепёшка домашняя', 'PCS')?.key).toBe('bread');
  });

  it('leaves out a sack, a different size and a word that only begins the same', () => {
    expect(basketItemOf('Рис лазер, 1 кг', 'PCS')).toBeNull();
    expect(basketItemOf('Рисовая мука', 'KG')).toBeNull();
    expect(basketItemOf('Лукум', 'KG')).toBeNull();
    expect(basketItemOf('Яйца перепелиные, 20 шт', 'PCS')).toBeNull();
    expect(basketItemOf('Яйца С1, 110 шт', 'PCS')).toBeNull();
    expect(basketItemOf('Картофель', 'PCS')).toBeNull();
    expect(basketItemOf('Патыр слоёный', 'PCS')).toBeNull();
  });
});

describe('the middle price', () => {
  it('is the middle one, or the mean of the two middle ones', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

describe('a good’s price on a day', () => {
  const tomato = good({
    nameRu: 'Помидоры',
    price: 20_000_00,
    history: [
      { price: 16_000_00, validFrom: daysAgo(20) },
      { price: 20_000_00, validFrom: daysAgo(2) },
    ],
  });

  it('is the last one recorded by then', () => {
    expect(priceAt(tomato, daysAgo(7))).toBe(16_000_00);
    expect(priceAt(tomato, NOW)).toBe(20_000_00);
  });

  it('is the first recorded one before the history starts, today’s when never changed', () => {
    expect(priceAt(tomato, daysAgo(30))).toBe(16_000_00);
    expect(priceAt(good({ nameRu: 'Лук', price: 7_000_00 }), daysAgo(30))).toBe(7_000_00);
  });

  it('is none before the good was put on sale', () => {
    expect(
      priceAt(good({ nameRu: 'Лук', price: 7_000_00, createdAt: daysAgo(3) }), daysAgo(7)),
    ).toBe(null);
  });
});

describe('the index of a city', () => {
  const goods: IndexedGood[] = [
    // Three stalls of potatoes; one put its price up this week.
    good({
      nameRu: 'Картофель',
      price: 10_000_00,
      storeId: 'a',
      history: [
        { price: 8_000_00, validFrom: daysAgo(30) },
        { price: 10_000_00, validFrom: daysAgo(3) },
      ],
    }),
    good({ nameRu: 'Картофель', price: 9_000_00, storeId: 'b' }),
    good({ nameRu: 'Картофель молодой', price: 11_000_00, storeId: 'c' }),
    // A stall that opened yesterday at a high price: not a rise.
    good({ nameRu: 'Картофель', price: 15_000_00, storeId: 'd', createdAt: daysAgo(1) }),
    // The supermarket.
    good({ nameRu: 'Картофель', price: 12_000_00, storeId: 'shop', shop: true }),
    // Something the basket does not watch, and a shop-only staple.
    good({ nameRu: 'Гранат', price: 32_000_00 }),
    good({ nameRu: 'Рис девзира', price: 38_000_00, storeId: 'shop', shop: true }),
  ];
  const index = buildPriceIndex(goods, { now: NOW, currency: 'UZS' });

  it('lists only what the bazaar rows sell', () => {
    expect(index.items.map((item) => item.key)).toEqual(['potatoes']);
  });

  it('gives the middle price of the rows, the spread and the stalls', () => {
    expect(index.items[0]).toMatchObject({
      median: 10_500_00,
      min: 9_000_00,
      max: 15_000_00,
      stalls: 4,
      shops: 12_000_00,
    });
  });

  it('moves the week over the same goods only', () => {
    // A week ago: 8 000, 9 000, 11 000 → 9 000. Today the same three: 9 000, 10 000, 11 000 → 10 000.
    expect(index.items[0]).toMatchObject({ weekAgo: 9_000_00, changePercent: 11.1 });
    expect(index.weekChangePercent).toBe(11.1);
  });

  it('draws the weeks, oldest first, today last', () => {
    const weeks = index.items[0]!.weeks;
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toBe(9_000_00);
    expect(weeks[7]).toBe(10_500_00);
  });

  it('says how much cheaper the rows are than the shops, over three staples at least', () => {
    // One staple is not a verdict.
    expect(index.cheaperThanShopsPercent).toBeNull();
    const three = buildPriceIndex(
      [
        good({ nameRu: 'Картофель', price: 9_000_00 }),
        good({ nameRu: 'Картофель', price: 12_000_00, shop: true }),
        good({ nameRu: 'Лук', price: 7_000_00 }),
        good({ nameRu: 'Лук', price: 10_000_00, shop: true }),
        good({ nameRu: 'Обі нон', price: 6_000_00, unit: 'PCS' }),
        good({ nameRu: 'Лепёшка', price: 5_000_00, unit: 'PCS', shop: true }),
      ],
      { now: NOW, currency: 'UZS' },
    );
    // 25 %, 30 % and −20 %: 11.7 → 12.
    expect(three.cheaperThanShopsPercent).toBe(12);
  });

  it('has no move and no comparison when there is nothing to compare', () => {
    const lone = buildPriceIndex(
      [good({ nameRu: 'Лук', price: 7_000_00, createdAt: daysAgo(2) })],
      {
        now: NOW,
        currency: 'UZS',
      },
    );
    expect(lone.items[0]).toMatchObject({ weekAgo: null, changePercent: null, shops: null });
    expect(lone.weekChangePercent).toBeNull();
    expect(lone.cheaperThanShopsPercent).toBeNull();
  });
});

describe('the arrows and the line', () => {
  it('points up, down, or not at all under half a percent', () => {
    expect(trendOf(3.3)).toBe('up');
    expect(trendOf(-2)).toBe('down');
    expect(trendOf(0.4)).toBe('flat');
    expect(trendOf(null)).toBe('flat');
  });

  it('says the move with the language’s decimal mark', () => {
    expect(changeText(createT('ru'), 3.3)).toBe('+3,3\u00a0%');
    expect(changeText(createT('ru'), -2)).toBe('−2\u00a0%');
    expect(changeText(createT('uz'), 0.2)).toBe('oʻzgarmadi');
  });

  it('draws the known weeks, highest at the top, and needs two of them', () => {
    expect(sparkPath([null, 100, null, 200], 34, 12, 2)).toBe('M12.0 10.0 L32.0 2.0');
    expect(sparkPath([100, 100], 10, 10, 0)).toBe('M0.0 5.0 L10.0 5.0');
    expect(sparkPath([null, 100], 10, 10)).toBeNull();
  });
});
