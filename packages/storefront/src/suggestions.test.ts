import { describe, expect, it } from 'vitest';

import { forgottenProducts } from './suggestions.js';

const product = (id: string, available = true) => ({ id, available }) as never;
const order = (storeId: string, ids: string[]) =>
  ({ storeId, items: ids.map((productId) => ({ productId })) }) as never;

describe('forgottenProducts', () => {
  it('ranks by how often it was bought, skips the cart and sold-out goods', () => {
    const products = [product('a'), product('b'), product('c', false), product('d')];
    const orders = [order('s', ['a', 'b']), order('s', ['b', 'c']), order('other', ['d'])];
    expect(forgottenProducts(orders, 's', new Set(), products).map((p) => p.id)).toEqual([
      'b',
      'a',
    ]);
    expect(forgottenProducts(orders, 's', new Set(['b']), products).map((p) => p.id)).toEqual([
      'a',
    ]);
  });
});
