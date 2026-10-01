/**
 * A flag in a query string is text. `z.coerce.boolean()` read it as `Boolean(text)`, so "false" and
 * "0" arrived as true: `GET /catalog?availableOnly=false` still hid every good that was switched off.
 */
import { describe, expect, it } from 'vitest';

import { queryBoolean } from './common.schema.js';
import { orderListQuerySchema } from './order.schema.js';
import { listQuerySchema } from './pagination.schema.js';
import { productListQuerySchema } from './product.schema.js';
import { reviewListQuerySchema } from './review.schema.js';
import { storeListQuerySchema } from './store.schema.js';

const ID = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';

describe('queryBoolean', () => {
  it('reads true, false, 1 and 0 as what they say', () => {
    expect(queryBoolean.parse('true')).toBe(true);
    expect(queryBoolean.parse('1')).toBe(true);
    expect(queryBoolean.parse('false')).toBe(false);
    expect(queryBoolean.parse('0')).toBe(false);
  });

  it('does not care about case', () => {
    expect(queryBoolean.parse('TRUE')).toBe(true);
    expect(queryBoolean.parse('False')).toBe(false);
  });

  it('passes a real boolean through', () => {
    expect(queryBoolean.parse(true)).toBe(true);
    expect(queryBoolean.parse(false)).toBe(false);
  });

  it('refuses anything else instead of guessing', () => {
    for (const garbage of ['yes', 'no', 'maybe', '', ' ', '2', 'null', 'constructor', null]) {
      expect(queryBoolean.safeParse(garbage).success, String(garbage)).toBe(false);
    }
    // ?flag=true&flag=false arrives as an array.
    expect(queryBoolean.safeParse(['true', 'false']).success).toBe(false);
  });

  it('leaves an absent flag absent, so the caller decides its default', () => {
    expect(queryBoolean.optional().parse(undefined)).toBeUndefined();
  });
});

describe('the list queries', () => {
  it('catalog and products: availableOnly=false is false, and absent stays absent', () => {
    // The shape the API builds: paging and the product filters in one object.
    const schema = listQuerySchema.merge(productListQuerySchema);

    expect(schema.parse({ availableOnly: 'false' }).availableOnly).toBe(false);
    expect(schema.parse({ availableOnly: '0' }).availableOnly).toBe(false);
    expect(schema.parse({ availableOnly: 'true' }).availableOnly).toBe(true);
    expect(schema.parse({}).availableOnly).toBeUndefined();

    // The customer app's "these products by id, sold out ones too".
    expect(schema.parse({ ids: ID, availableOnly: 'false', pageSize: '100' })).toMatchObject({
      ids: [ID],
      availableOnly: false,
      pageSize: 100,
    });
  });

  it('refuses a garbage availableOnly with the field named', () => {
    const result = productListQuerySchema.safeParse({ availableOnly: 'nope' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['availableOnly']);
  });

  it('stores: mine=false and openNow=false are false, not the vendor’s own stalls', () => {
    expect(storeListQuerySchema.parse({ mine: 'false', openNow: '0' })).toMatchObject({
      mine: false,
      openNow: false,
    });
    expect(storeListQuerySchema.parse({ mine: 'true', openNow: '1' })).toMatchObject({
      mine: true,
      openNow: true,
    });
    expect(storeListQuerySchema.safeParse({ mine: 'sure' }).success).toBe(false);
  });

  it('orders: activeOnly=false lists the finished ones too', () => {
    expect(orderListQuerySchema.parse({ activeOnly: 'false' }).activeOnly).toBe(false);
    expect(orderListQuerySchema.parse({ activeOnly: 'true' }).activeOnly).toBe(true);
    expect(orderListQuerySchema.safeParse({ activeOnly: 'x' }).success).toBe(false);
  });

  it('reviews: published=false asks for the unpublished ones', () => {
    expect(reviewListQuerySchema.parse({ published: 'false' }).published).toBe(false);
    expect(reviewListQuerySchema.parse({ published: 'true' }).published).toBe(true);
    expect(reviewListQuerySchema.safeParse({ published: 'x' }).success).toBe(false);
  });
});
