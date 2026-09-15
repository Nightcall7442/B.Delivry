import { describe, expect, it } from 'vitest';

import { listProducts } from './catalog-data.js';
import { groupByStore } from './cart-group.js';

const products = await listProducts();
const byId = (id: string) => {
  const found = products.find((p) => p.id === id);
  if (!found) throw new Error(`fixture ${id} is gone`);
  return found;
};

describe('groupByStore', () => {
  it('splits the basket per store, because each store is its own courier trip', () => {
    const groups = groupByStore(products, { 'p-tomato': 1, 'p-obi-non': 2 });
    expect(groups.map((g) => g.storeId).sort()).toEqual(['chorsu-zelen', 'non-uyi']);
  });

  it('keeps a half-kilo line on whole tiyin', () => {
    const tomato = byId('p-tomato');
    const [group] = groupByStore(products, { 'p-tomato': 0.5 });
    expect(group?.lines[0]?.total.amount).toBe(tomato.price.amount / 2);
    expect(Number.isInteger(group?.subtotal.amount)).toBe(true);
  });

  it('sums only what can actually be bought', () => {
    // p-soap is the out-of-stock fixture on the supermarket shelf.
    const groups = groupByStore(products, { 'p-rice': 2, 'p-soap': 3 });
    const group = groups.find((g) => g.storeId === 'makro-yunusabad');

    expect(group?.subtotal.amount).toBe(byId('p-rice').price.amount * 2);
    expect(group?.unavailable.map((line) => line.product.id)).toEqual(['p-soap']);
  });

  it('ignores quantities that are zero, negative or for products that vanished', () => {
    expect(groupByStore(products, { 'p-tomato': 0, 'p-gone': 5, 'p-obi-non': -1 })).toEqual([]);
  });

  it('carries the currency through instead of assuming one', () => {
    const [group] = groupByStore(products, { 'p-peach': 1 });
    expect(group?.subtotal.currency).toBe('UZS');
  });
});
