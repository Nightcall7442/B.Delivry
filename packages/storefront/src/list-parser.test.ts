import { describe, expect, it } from 'vitest';

import { parseShoppingList } from './list-parser.js';

const product = (id: string, ru: string, uz: string, unit: 'KG' | 'PCS', minQuantity = 1) =>
  ({
    id,
    name: { ru, uz },
    unit,
    minQuantity,
    quantityStep: minQuantity,
    available: true,
  }) as never;
const products = [
  product('tomato', 'Помидоры бакинские', 'Boku pomidori', 'KG', 0.5),
  product('potato', 'Картофель', 'Kartoshka', 'KG'),
  product('greens', 'Зелень', 'Koʻkatlar', 'PCS'),
  product('non', 'Оби-нон', 'Obi non', 'PCS'),
  product('beef', 'Говядина', 'Mol goʻshti', 'KG'),
];

describe('parseShoppingList', () => {
  it('reads a Russian list with weights, pieces and number words', () => {
    const lines = parseShoppingList(
      '2 кг помидор, 500г картошки и три лепёшки\nпучок зелени',
      products,
    );
    expect(lines.map((l) => [l.product?.id ?? null, l.quantity])).toEqual([
      ['tomato', 2],
      ['potato', 0.5],
      ['non', 3],
      ['greens', 1],
    ]);
  });

  it('reads an Uzbek list and keeps unknown items for manual pick', () => {
    const lines = parseShoppingList(
      "ikki kilo kartoshka, 1 kg mol go'shti, bitta non, shakar",
      products,
    );
    expect(lines.map((l) => [l.product?.id ?? null, l.quantity])).toEqual([
      ['potato', 2],
      ['beef', 1],
      ['non', 1],
      [null, 1],
    ]);
  });

  it('uses the product minimum when no quantity is given', () => {
    expect(parseShoppingList('помидоры', products)[0]?.quantity).toBe(0.5);
  });
});
