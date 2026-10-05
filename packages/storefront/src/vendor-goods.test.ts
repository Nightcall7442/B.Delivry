import { describe, expect, it } from 'vitest';

import {
  MAX_PRICE_MINOR,
  isSoldOut,
  parsePriceInput,
  parseSaleInput,
  parseStockInput,
  priceInputText,
  searchStallProducts,
  sortStallProducts,
  stockText,
  toStallProducts,
  validateProductEdit,
  type StallProduct,
} from './vendor-goods.js';

const product = (over: Partial<StallProduct> = {}): StallProduct => ({
  id: 'p1',
  storeId: 's1',
  name: { ru: 'Помидоры', uz: 'Pomidor' },
  unit: 'KG',
  price: { amount: 1_250_000, currency: 'UZS' },
  oldPrice: null,
  available: true,
  stock: null,
  imageUrl: null,
  arrivedAt: null,
  ...over,
});

describe('toStallProducts', () => {
  it('reads a sale in either shape, and drops a struck-through price that is not above the price', () => {
    const [row, dto, bogus] = toStallProducts([
      { id: 'a', storeId: 's1', name: {}, price: 900_000, oldPrice: 1_200_000, currency: 'UZS' },
      {
        id: 'b',
        storeId: 's1',
        name: {},
        price: { amount: 900_000, currency: 'UZS' },
        oldPrice: { amount: 1_000_000, currency: 'UZS' },
      },
      { id: 'c', storeId: 's1', name: {}, price: 900_000, oldPrice: 900_000, currency: 'UZS' },
    ]);
    expect(row?.oldPrice).toEqual({ amount: 1_200_000, currency: 'UZS' });
    expect(dto?.oldPrice).toEqual({ amount: 1_000_000, currency: 'UZS' });
    expect(bogus?.oldPrice).toBeNull();
  });

  it('reads the rows of GET /products: a bare integer price, a decimal string for the stock', () => {
    const [good] = toStallProducts([
      {
        id: 'p1',
        storeId: 's1',
        name: { ru: 'Помидоры', uz: 'Pomidor' },
        unit: 'KG',
        price: 1_250_000,
        currency: 'UZS',
        available: false,
        stock: '12.500',
        arrivedAt: '2026-10-01T02:40:00.000Z',
        images: [{ url: 'https://img/1.jpg', sortOrder: 0 }],
      },
    ]);
    expect(good).toEqual({
      id: 'p1',
      storeId: 's1',
      name: { ru: 'Помидоры', uz: 'Pomidor' },
      unit: 'KG',
      price: { amount: 1_250_000, currency: 'UZS' },
      oldPrice: null,
      available: false,
      stock: 12.5,
      imageUrl: 'https://img/1.jpg',
      arrivedAt: '2026-10-01T02:40:00.000Z',
    });
  });

  it('reads a ProductDto just as well, the day that route starts answering them', () => {
    const [good] = toStallProducts([
      {
        id: 'p2',
        storeId: 's1',
        name: { ru: 'Лук' },
        unit: 'PCS',
        price: { amount: 300_000, currency: 'UZS' },
        available: true,
        stock: null,
        arrivedAt: null,
        images: [],
      },
    ]);
    expect(good?.price).toEqual({ amount: 300_000, currency: 'UZS' });
    expect(good?.oldPrice).toBeNull();
    expect(good?.stock).toBeNull();
    expect(good?.imageUrl).toBeNull();
  });

  it('drops what is not a good and counts a good carried by two pages once', () => {
    const row = { id: 'p1', storeId: 's1', name: { ru: 'Лук' }, unit: 'KG', price: 100 };
    expect(
      toStallProducts([
        row,
        null,
        'p2',
        { id: 'p3', storeId: 's1', price: 'дорого' },
        { storeId: 's1', price: 100 },
        { ...row, price: 999 },
      ]),
    ).toHaveLength(1);
  });

  it('falls back to pieces, som and on-sale for a row that says nothing', () => {
    const [good] = toStallProducts([{ id: 'p1', storeId: 's1', price: 500, unit: 'BUNCH' }]);
    expect(good).toMatchObject({
      unit: 'PCS',
      price: { currency: 'UZS' },
      available: true,
      name: {},
    });
  });
});

describe('sortStallProducts', () => {
  it('puts what can be bought first, sold-out goods next and what is off the shelf last', () => {
    const sorted = sortStallProducts([
      product({ id: 'off', name: { ru: 'Абрикосы' }, available: false }),
      product({ id: 'out', name: { ru: 'Баклажаны' }, stock: 0 }),
      product({ id: 'yes2', name: { ru: 'Яблоки' } }),
      product({ id: 'yes1', name: { ru: 'Огурцы' }, stock: 4 }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['yes1', 'yes2', 'out', 'off']);
  });

  it('keeps the order alphabetical inside a group, ё with е, and leaves the input alone', () => {
    const input = [
      product({ id: 'b', name: { ru: 'Ёжик-морковь' } }),
      product({ id: 'a', name: { ru: 'Дыня' } }),
      product({ id: 'c', name: { ru: 'Яблоки' } }),
    ];
    expect(sortStallProducts(input).map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('searchStallProducts', () => {
  const shelf = [
    product({ id: 'a', name: { ru: 'Помидоры красные', uz: 'Qizil pomidor' } }),
    product({ id: 'b', name: { ru: 'Огурцы', uz: 'Bodring' } }),
    product({ id: 'c', name: { ru: 'Мёд горный', uz: 'Togʻ asali' } }),
  ];

  it('finds by any word of the name, in either language, whatever the case', () => {
    expect(searchStallProducts(shelf, 'ПОМИДОР').map((row) => row.id)).toEqual(['a']);
    expect(searchStallProducts(shelf, 'bodring').map((row) => row.id)).toEqual(['b']);
  });

  it('wants every word typed, in any order', () => {
    expect(searchStallProducts(shelf, 'красные помидоры').map((row) => row.id)).toEqual(['a']);
    expect(searchStallProducts(shelf, 'красные огурцы')).toEqual([]);
  });

  it('does not stop at ё or at the Uzbek apostrophe', () => {
    expect(searchStallProducts(shelf, 'мед').map((row) => row.id)).toEqual(['c']);
    expect(searchStallProducts(shelf, "tog'").map((row) => row.id)).toEqual(['c']);
  });

  it('shows everything for a blank query', () => {
    expect(searchStallProducts(shelf, '   ')).toHaveLength(3);
  });
});

describe('parsePriceInput', () => {
  it('turns soum into tiyin', () => {
    expect(parsePriceInput('12500')).toEqual({ ok: true, value: 1_250_000 });
    expect(parsePriceInput('12 500')).toEqual({ ok: true, value: 1_250_000 });
    expect(parsePriceInput('12 500')).toEqual({ ok: true, value: 1_250_000 });
  });

  it('takes a comma or a dot, and rounds half up to the tiyin', () => {
    expect(parsePriceInput('12500,5')).toEqual({ ok: true, value: 1_250_050 });
    expect(parsePriceInput('0.29')).toEqual({ ok: true, value: 29 });
    // 1.005 * 100 is 100.49999999999999 as a float: the digits, not the float, decide.
    expect(parsePriceInput('1.005')).toEqual({ ok: true, value: 101 });
    expect(parsePriceInput('1.004')).toEqual({ ok: true, value: 100 });
    expect(parsePriceInput('0.004')).toMatchObject({ ok: false });
  });

  it('refuses nothing, zero, negatives, words and stray signs', () => {
    for (const bad of ['', '  ', '0', '0,00', '-5', '12,5,5', 'дорого', '12к', '1e5', '.5']) {
      expect(parsePriceInput(bad)).toMatchObject({ ok: false });
    }
  });

  it('refuses a price the 32-bit column cannot hold', () => {
    expect(parsePriceInput('21474836.47')).toEqual({ ok: true, value: MAX_PRICE_MINOR });
    expect(parsePriceInput('21474836.48')).toMatchObject({ ok: false });
    expect(parsePriceInput('99999999999')).toMatchObject({ ok: false });
  });
});

describe('priceInputText', () => {
  it('is what parsePriceInput reads back', () => {
    for (const minor of [100, 1_250_000, 1_250_050, 29, 500_001]) {
      expect(parsePriceInput(priceInputText(minor))).toEqual({ ok: true, value: minor });
    }
    expect(priceInputText(1_250_000)).toBe('12500');
    expect(priceInputText(1_250_050)).toBe('12500.5');
  });
});

describe('parseStockInput', () => {
  it('reads an empty field as «not counted»', () => {
    expect(parseStockInput('', 'KG')).toEqual({ ok: true, value: null });
    expect(parseStockInput('  ', 'PCS')).toEqual({ ok: true, value: null });
  });

  it('wants whole numbers for pieces, packs and boxes', () => {
    expect(parseStockInput('12', 'PCS')).toEqual({ ok: true, value: 12 });
    expect(parseStockInput('0', 'BOX')).toEqual({ ok: true, value: 0 });
    for (const bad of ['1,5', '2.5', '-1', 'много']) {
      expect(parseStockInput(bad, 'PACK')).toMatchObject({ ok: false });
    }
  });

  it('lets weighed and poured goods be half-stocked, to three decimals', () => {
    expect(parseStockInput('12,5', 'KG')).toEqual({ ok: true, value: 12.5 });
    expect(parseStockInput('0.250', 'L')).toEqual({ ok: true, value: 0.25 });
    expect(parseStockInput('1.2345', 'KG')).toMatchObject({ ok: false });
  });

  it('refuses a stock the column cannot hold', () => {
    expect(parseStockInput('10000000', 'PCS')).toMatchObject({ ok: false });
  });
});

describe('validateProductEdit', () => {
  it('sends the price in tiyin with its currency, and the stock when it is typed', () => {
    const result = validateProductEdit(
      { price: '13 000', stock: '8' },
      product({ unit: 'PCS', stock: 10 }),
    );
    expect(result).toEqual({
      ok: true,
      changed: true,
      update: { price: { amount: 1_300_000, currency: 'UZS' }, stock: 8 },
    });
  });

  it('leaves the stock out when the good is not counted and the field is empty', () => {
    const result = validateProductEdit({ price: '13000', stock: '' }, product());
    expect(result).toMatchObject({ ok: true, changed: true });
    if (result.ok) expect(result.update).toEqual({ price: { amount: 1_300_000, currency: 'UZS' } });
  });

  it('says nothing changed when the sheet is saved as it was opened', () => {
    const good = product({ stock: 12.5 });
    expect(
      validateProductEdit({ price: priceInputText(good.price.amount), stock: '12,5' }, good),
    ).toMatchObject({ ok: true, changed: false });
    expect(validateProductEdit({ price: '12500', stock: '' }, product())).toMatchObject({
      ok: true,
      changed: false,
    });
  });

  it('will not clear the stock of a counted good: the API would read it as 0', () => {
    const result = validateProductEdit({ price: '12500', stock: '' }, product({ stock: 3 }));
    expect(result).toMatchObject({ ok: false, errors: { stock: expect.any(String) } });
  });

  it('reports both fields at once', () => {
    const result = validateProductEdit({ price: 'abc', stock: '1,5' }, product({ unit: 'PCS' }));
    expect(result).toMatchObject({
      ok: false,
      errors: { price: expect.any(String), stock: expect.any(String) },
    });
  });
});

describe('small helpers', () => {
  it('knows a counted good with nothing left, and never a good that is not counted', () => {
    expect(isSoldOut({ stock: 0 })).toBe(true);
    expect(isSoldOut({ stock: 0.5 })).toBe(false);
    expect(isSoldOut({ stock: null })).toBe(false);
  });

  it('writes a stock the way it is read aloud', () => {
    expect(stockText(12)).toBe('12');
    expect(stockText(1.5)).toBe('1,5');
    expect(stockText(0.1 + 0.2)).toBe('0,3');
  });
});

describe('parseSaleInput', () => {
  const price = { amount: 1_250_000, currency: 'UZS' as const };

  it('reads an empty field as no sale', () => {
    expect(parseSaleInput('', price)).toEqual({ ok: true, value: null });
    expect(parseSaleInput('  ', price)).toEqual({ ok: true, value: null });
  });

  it('takes a price below the one on the counter, in soum as typed', () => {
    expect(parseSaleInput('9 900', price)).toEqual({ ok: true, value: 990_000 });
  });

  it('refuses a «discount» that is not below the price, and what is not a price', () => {
    expect(parseSaleInput('12500', price).ok).toBe(false);
    expect(parseSaleInput('13000', price).ok).toBe(false);
    expect(parseSaleInput('дёшево', price).ok).toBe(false);
  });
});
