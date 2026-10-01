/**
 * `availableOnly` travels as text in the query string. It was read with `z.coerce.boolean()`, so
 * `?availableOnly=false` arrived as true: the customer app's "these goods by id, sold-out ones too"
 * and the seller app's shelf both still got only what was switched on. Query string to the WHERE
 * clause of the real repositories, end to end.
 */
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { parseOrThrow } from '../../src/middleware/validation.middleware.js';
import { CatalogRepository } from '../../src/modules/catalog/repository/catalog.repository.js';
import { catalogSearchQuerySchema } from '../../src/modules/catalog/schemas/index.js';
import { ProductsRepository } from '../../src/modules/products/repository/products.repository.js';
import { productsListQuerySchema } from '../../src/modules/products/schemas/index.js';

const ID = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';

/** A Prisma that only remembers the WHERE of the list query. */
function fakePrisma() {
  const seen: { where?: Record<string, unknown> } = {};
  return {
    seen,
    prisma: {
      product: {
        async findMany(args: { where: Record<string, unknown> }) {
          seen.where = args.where;
          return [];
        },
        async count() {
          return 0;
        },
      },
    } as never,
  };
}

const inTenant = <T>(fn: () => Promise<T>) => runWithContext(systemContext('t1', 'r1', 'ru'), fn);

async function catalogWhere(query: Record<string, unknown>) {
  const { prisma, seen } = fakePrisma();
  const filters = parseOrThrow(catalogSearchQuerySchema, query);
  await inTenant(() => new CatalogRepository(prisma).search(filters));
  return seen.where;
}

async function productsWhere(query: Record<string, unknown>) {
  const { prisma, seen } = fakePrisma();
  const filters = parseOrThrow(productsListQuerySchema, query);
  await inTenant(() => new ProductsRepository(prisma).list(filters));
  return seen.where;
}

describe('GET /catalog', () => {
  it('shows only what is on sale, unless availableOnly is explicitly false', async () => {
    expect(await catalogWhere({})).toMatchObject({ available: true });
    expect(await catalogWhere({ availableOnly: 'true' })).toMatchObject({ available: true });
    expect(await catalogWhere({ availableOnly: '1' })).toMatchObject({ available: true });
  });

  it('availableOnly=false lists the switched-off goods too, the basket’s by id included', async () => {
    for (const off of ['false', '0']) {
      const where = await catalogWhere({ availableOnly: off });
      expect(where).not.toHaveProperty('available');
    }
    const byId = await catalogWhere({ ids: ID, availableOnly: 'false', pageSize: '100' });
    expect(byId).toMatchObject({ id: { in: [ID] } });
    expect(byId).not.toHaveProperty('available');
  });

  it('refuses a flag it cannot read, rather than guessing which list was meant', async () => {
    await expect(catalogWhere({ availableOnly: 'nope' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('GET /products (the seller’s own list)', () => {
  it('shows every good by default, and only the ones on sale for availableOnly=true', async () => {
    expect(await productsWhere({})).not.toHaveProperty('available');
    expect(await productsWhere({ availableOnly: 'true' })).toMatchObject({ available: true });
  });

  it('availableOnly=false is the same as asking for nothing', async () => {
    expect(await productsWhere({ availableOnly: 'false' })).not.toHaveProperty('available');
  });

  it('refuses a flag it cannot read', async () => {
    await expect(productsWhere({ availableOnly: 'nope' })).rejects.toBeInstanceOf(ValidationError);
  });
});
