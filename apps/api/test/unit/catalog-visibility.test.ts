/**
 * What the shop window shows to whom. `GET /stores` took `status` and `vendorId` from anyone, so a
 * stall in review, suspended or a draft (and the vendor behind it) was a query string away from an
 * anonymous caller; `GET /products` answered every signed-in user with every vendor's goods,
 * switched-off ones included; the catalog opened the goods of any stall by id and priced them into
 * any basket; a vendor could read any other vendor's price history; the desk could not edit a shelf
 * at all. Real repositories and services run here against a fake Prisma that evaluates the WHERE
 * clauses they send, so the tests see what a caller would get, not what the query looks like.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, StoreClosedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { parseOrThrow } from '../../src/middleware/validation.middleware.js';
import {
  ANONYMOUS,
  canSeeStore,
  currentViewer,
  visibleProductWhere,
  visibleStoreWhere,
  type Viewer,
} from '../../src/modules/catalog/domain/visibility.js';
import { CatalogRepository } from '../../src/modules/catalog/repository/catalog.repository.js';
import { catalogSearchQuerySchema } from '../../src/modules/catalog/schemas/index.js';
import { CatalogService } from '../../src/modules/catalog/service/catalog.service.js';
import { CategoriesController } from '../../src/modules/categories/controller/categories.controller.js';
import { CategoriesRepository } from '../../src/modules/categories/repository/categories.repository.js';
import { CategoriesService } from '../../src/modules/categories/service/categories.service.js';
import { ProductsController } from '../../src/modules/products/controller/products.controller.js';
import { ProductsRepository } from '../../src/modules/products/repository/products.repository.js';
import { productsListQuerySchema } from '../../src/modules/products/schemas/index.js';
import { ProductsService } from '../../src/modules/products/service/products.service.js';
import {
  StoresController,
  toStoreView,
} from '../../src/modules/stores/controller/stores.controller.js';
import { StoresRepository } from '../../src/modules/stores/repository/stores.repository.js';
import { storesListQuerySchema } from '../../src/modules/stores/schemas/index.js';
import { StoresService } from '../../src/modules/stores/service/stores.service.js';

const T = 't1';

/** Ids on the wire are UUIDs; the tests read better with names, so a name is a stable id. */
const uuids = new Map<string, string>();
const labels = new Map<string, string>();
function U(label: string): string {
  let id = uuids.get(label);
  if (id === undefined) {
    id = `00000000-0000-4000-8000-${(uuids.size + 1).toString(16).padStart(12, '0')}`;
    uuids.set(label, id);
    labels.set(id, label);
  }
  return id;
}
const L = (id: unknown): string => labels.get(String(id)) ?? String(id);

const A = U('vendor-a');
const B = U('vendor-b');
/** A vendor the platform has suspended. */
const SHUT = U('vendor-shut');

// ---------------------------------------------------------------- who is asking

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext(T, 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}-${Object.values(ids).join('-')}`,
      tenantId: T,
      roles,
      permissions: effectivePermissions(roles as never),
      sessionId: 's1',
      locale: 'ru',
      ...ids,
    },
  }) as never;

const anonymous = { ...systemContext(T, 'r1', 'ru'), system: undefined, user: null } as never;
const customer = as(['CUSTOMER'], { customerId: 'cust-1' });
const vendorA = as(['VENDOR'], { vendorId: A });
const vendorB = as(['VENDOR'], { vendorId: B });
/** A vendor who owns none of the stalls in the world. */
const vendorC = as(['VENDOR'], { vendorId: U('vendor-c') });
/** Holds the vendor role, but no vendor profile rides on the token: not the desk, not an owner. */
const vendorNoProfile = as(['VENDOR']);
const admin = as(['ADMIN']);
const operator = as(['OPERATOR']);
const job = systemContext(T, 'job', 'ru');

// ---------------------------------------------------------------- the world

type Row = Record<string, unknown>;

/** Just enough of Prisma's where: equality, `in`, `notIn`, a numeric range, AND, OR, a nested relation. Anything else throws. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('notIn' in c) return !(c.notIn as unknown[]).includes(value);
      if ('gte' in c || 'lte' in c) {
        return (
          typeof value === 'number' &&
          (c.gte === undefined || value >= (c.gte as number)) &&
          (c.lte === undefined || value <= (c.lte as number))
        );
      }
      if (value !== null && typeof value === 'object') return matches(value as Row, c);
      throw new Error(`fake prisma: unsupported condition on ${key}: ${JSON.stringify(cond)}`);
    }
    return value === cond;
  });
}

const store = (label: string, vendorId: string, status: string, over: Row = {}): Row => ({
  id: U(label),
  tenantId: T,
  vendorId,
  type: 'BAZAAR_STALL',
  status,
  name: { ru: label },
  description: null,
  slug: label,
  logoUrl: null,
  coverUrl: null,
  counterPhotoUrl: null,
  counterPhotoAt: null,
  promotedUntil: null,
  tags: [],
  phone: '+998901234567',
  cityId: U('city'),
  address: null,
  lat: null,
  lng: null,
  standNumber: null,
  ownerName: null,
  ownerSince: null,
  ownerPhotoUrl: null,
  ownerMotto: null,
  chainSlug: null,
  minOrder: null,
  freeDeliveryThreshold: null,
  rating: 0,
  reviewCount: 0,
  preparationMinutes: 15,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null,
  schedule: [],
  ...over,
});

const product = (label: string, storeLabel: string, over: Row = {}): Row => ({
  id: U(label),
  tenantId: T,
  storeId: U(storeLabel),
  categoryId: null,
  name: { ru: label },
  slug: label,
  price: 1000,
  currency: 'UZS',
  available: true,
  deletedAt: null,
  images: [],
  priceTiers: [],
  ...over,
});

function world() {
  const stores = [
    store('s-live', A, 'ACTIVE'),
    store('s-closed', A, 'CLOSED'),
    store('s-review', A, 'PENDING_REVIEW'),
    store('s-draft', B, 'DRAFT'),
    store('s-suspended', B, 'SUSPENDED'),
    store('s-b-live', B, 'ACTIVE'),
    store('s-gone', B, 'CLOSED', { deletedAt: new Date(1) }),
    store('s-foreign', U('vendor-x'), 'ACTIVE', { tenantId: 't2' }),
    // Live by its own status, but the platform has suspended its vendor.
    store('s-shut-vendor', SHUT, 'ACTIVE'),
  ];
  const vendors = [
    { id: A, tenantId: T, status: 'ACTIVE' },
    { id: B, tenantId: T, status: 'PENDING' },
    { id: SHUT, tenantId: T, status: 'SUSPENDED' },
  ];
  const withVendor = (row: Row): Row => ({
    ...row,
    vendor: vendors.find((v) => v.id === row.vendorId) ?? { status: 'ACTIVE' },
  });
  const products = [
    product('p-live', 's-live'),
    product('p-live-off', 's-live', { available: false }),
    product('p-review', 's-review'),
    product('p-suspended', 's-suspended'),
    product('p-b-live', 's-b-live'),
    product('p-b-off', 's-b-live', { available: false }),
    product('p-removed', 's-live', { deletedAt: new Date(1) }),
    product('p-gone-store', 's-gone'),
  ];
  const withStore = (row: Row): Row => ({
    ...row,
    store: withVendor(stores.find((s) => s.id === row.storeId) ?? {}),
  });

  const prisma = {
    store: {
      async findMany({ where }: { where: Row }) {
        return stores.map(withVendor).filter((row) => matches(row, where));
      },
      async findFirst({ where }: { where: Row }) {
        return stores.map(withVendor).find((row) => matches(row, where)) ?? null;
      },
      async count({ where }: { where: Row }) {
        return stores.map(withVendor).filter((row) => matches(row, where)).length;
      },
    },
    vendor: {
      async findFirst({ where }: { where: Row }) {
        return vendors.find((row) => matches(row, where)) ?? null;
      },
    },
    product: {
      async findMany({ where }: { where: Row }) {
        return products.map(withStore).filter((row) => matches(row, where));
      },
      async findFirst({ where }: { where: Row }) {
        return products.map(withStore).find((row) => matches(row, where)) ?? null;
      },
      async count({ where }: { where: Row }) {
        return products.map(withStore).filter((row) => matches(row, where)).length;
      },
    },
  };
  return { stores, products, withVendor, prisma: prisma as never };
}

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const events = { async publish() {} };

function storesWorld() {
  const w = world();
  const repository = new StoresRepository(w.prisma);
  const service = new StoresService({
    repository,
    prisma: w.prisma,
    queue: {},
    logger,
    events,
  } as never);
  return { ...w, repository, service, controller: new StoresController(service, {} as never) };
}

const labelsOf = (page: { items: { id: string }[] }) => page.items.map((row) => L(row.id));

const listStores = (who: unknown, query: Record<string, unknown> = {}) => {
  const { service } = storesWorld();
  const filters = parseOrThrow(storesListQuerySchema, query);
  return runWithContext(who as never, async () => labelsOf(await service.list(filters)));
};

// ================================================================ the viewer

describe('who is looking', () => {
  it('reads the desk from order:read_any, never from a vendor token without a profile', () => {
    const viewerIn = (ctx: unknown): Viewer => runWithContext(ctx as never, () => currentViewer());
    expect(viewerIn(admin)).toEqual({ staff: true });
    expect(viewerIn(operator)).toEqual({ staff: true });
    expect(viewerIn(job)).toEqual({ staff: true });
    expect(viewerIn(customer)).toEqual({ staff: false });
    expect(viewerIn(anonymous)).toEqual({ staff: false });
    expect(viewerIn(vendorA)).toEqual({ staff: false, vendorId: A });
    // The token says "vendor" and names nobody: the public, not the desk and not an owner.
    expect(viewerIn(vendorNoProfile)).toEqual({ staff: false });
    // No context at all (a script, a test): fail closed.
    expect(currentViewer()).toEqual(ANONYMOUS);
  });

  it('answers the same for one stall in hand and for the WHERE clause sent to the database', () => {
    const viewers: Viewer[] = [{ staff: true }, ANONYMOUS, { staff: false, vendorId: A }];
    const statuses = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'CLOSED'];
    for (const viewer of viewers) {
      for (const status of statuses) {
        for (const vendorId of [A, B]) {
          for (const deletedAt of [null, new Date(1)]) {
            const row = { status, vendorId, deletedAt, vendor: { status: 'ACTIVE' } };
            expect(matches(row, visibleStoreWhere(viewer)), JSON.stringify([viewer, row])).toBe(
              canSeeStore(row, viewer),
            );
          }
        }
      }
    }
  });
});

// ================================================================ a suspended vendor

describe('a vendor the platform has suspended', () => {
  it('has its stalls shut to the public, but not to the owner or the desk', async () => {
    for (const who of [anonymous, customer, vendorNoProfile, vendorA]) {
      expect(await listStores(who)).not.toContain('s-shut-vendor');
      const { service } = storesWorld();
      await expect(
        runWithContext(who as never, () => service.getVisible(U('s-shut-vendor'))),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    const owner = as(['VENDOR'], { vendorId: SHUT });
    expect(await listStores(owner, { mine: 'true' })).toContain('s-shut-vendor');
    const { service } = storesWorld();
    for (const who of [owner, admin]) {
      await expect(
        runWithContext(who as never, () => service.getVisible(U('s-shut-vendor'))),
      ).resolves.toBeDefined();
    }
  });

  it('takes no new orders, whatever the stall’s own status says', async () => {
    const { service, stores, repository } = storesWorld();
    // Open round the clock, with a map point: only the vendor's standing can refuse the order now.
    const allDay = Array.from({ length: 8 }, (_, weekday) => ({
      weekday,
      opensAt: 0,
      closesAt: 1440,
      closed: false,
    }));
    repository.findById = (async (id: string) => {
      const row = stores.find((candidate) => candidate.id === id);
      return row === undefined ? null : { ...row, lat: 41.55, lng: 60.63, schedule: allDay };
    }) as never;
    await expect(
      runWithContext(customer, () => service.getOpenStore(U('s-live'))),
    ).resolves.toMatchObject({ id: U('s-live') });
    await expect(
      runWithContext(customer, () => service.getOpenStore(U('s-shut-vendor'))),
    ).rejects.toBeInstanceOf(StoreClosedError);
  });

  it('puts none of its goods in front of the public', async () => {
    const { prisma } = world();
    const found = await runWithContext(anonymous, () =>
      (
        prisma as never as { product: { findMany: (a: unknown) => Promise<Row[]> } }
      ).product.findMany({
        where: { AND: [visibleProductWhere(ANONYMOUS, { soldOutToo: false })] },
      }),
    );
    expect(found.map((row) => row.storeId)).not.toContain(U('s-shut-vendor'));
  });
});

// ================================================================ GET /stores

describe('GET /stores', () => {
  it('lists live stalls to the public, and closed ones only when asked', async () => {
    for (const who of [anonymous, customer, vendorNoProfile]) {
      expect(await listStores(who)).toEqual(['s-live', 's-b-live']);
      expect(await listStores(who, { status: 'CLOSED' })).toEqual(['s-closed']);
    }
  });

  it('gives the public nothing for a status that is not theirs to see', async () => {
    for (const who of [anonymous, customer, vendorNoProfile]) {
      for (const status of ['PENDING_REVIEW', 'DRAFT', 'SUSPENDED']) {
        expect(await listStores(who, { status }), status).toEqual([]);
      }
    }
  });

  it('refuses the public a vendorId filter, and gives a vendor only their own', async () => {
    for (const who of [anonymous, customer, vendorNoProfile, vendorB]) {
      await expect(listStores(who, { vendorId: A })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await listStores(vendorA, { vendorId: A })).toEqual(['s-live']);
  });

  it('shows a vendor their own stalls in every status, and only theirs', async () => {
    // The seller app lists its stalls with `mine`: a stall in review must be there to open.
    expect(await listStores(vendorA, { mine: 'true' })).toEqual(['s-live', 's-closed', 's-review']);
    expect(await listStores(vendorB, { mine: 'true' })).toEqual([
      's-draft',
      's-suspended',
      's-b-live',
    ]);
    // Asking by status without `mine`, nobody else's stall in review turns up.
    expect(await listStores(vendorA, { status: 'PENDING_REVIEW' })).toEqual(['s-review']);
    expect(await listStores(vendorB, { status: 'PENDING_REVIEW' })).toEqual([]);
    // Browsing like a customer, a vendor sees the live shelf.
    expect(await listStores(vendorA)).toEqual(['s-live', 's-b-live']);
  });

  it('takes `mine=false` at its word', async () => {
    expect(await listStores(vendorA, { mine: 'false' })).toEqual(['s-live', 's-b-live']);
  });

  it('refuses `mine` to a token with no vendor profile and to nobody signed in', async () => {
    await expect(listStores(vendorNoProfile, { mine: 'true' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listStores(customer, { mine: 'true' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listStores(anonymous, { mine: 'true' })).rejects.toThrow();
  });

  it('lets the desk ask for any status and any vendor', async () => {
    for (const who of [admin, operator, job]) {
      expect(await listStores(who, { status: 'PENDING_REVIEW' })).toEqual(['s-review']);
      expect(await listStores(who, { status: 'SUSPENDED' })).toEqual(['s-suspended']);
      expect(await listStores(who, { status: 'DRAFT', vendorId: B })).toEqual(['s-draft']);
    }
    // Their tenant only, and not what was removed.
    expect(await listStores(admin, { status: 'CLOSED' })).toEqual(['s-closed']);
  });

  it('narrows the nearby search the same way', async () => {
    const w = storesWorld();
    const prisma = {
      store: {
        async findMany({ where }: { where: Row }) {
          return w.stores
            .map((row) => ({ ...w.withVendor(row), lat: 41.55, lng: 60.63 }))
            .filter((row) => matches(row, where));
        },
      },
    } as never;
    const near = (who: unknown, status: string) =>
      runWithContext(who as never, async () => {
        const found = await new StoresRepository(prisma).findNearby(41.55, 60.63, 1000, {
          status,
        } as never);
        return found.map((row) => L(row.id));
      });
    expect(await near(anonymous, 'SUSPENDED')).toEqual([]);
    expect(await near(anonymous, 'ACTIVE')).toEqual(['s-live', 's-b-live']);
    expect(await near(admin, 'SUSPENDED')).toEqual(['s-suspended']);
  });
});

// ================================================================ GET /stores/:id

describe('GET /stores/:id', () => {
  const get = (who: unknown, label: string) => {
    const { service } = storesWorld();
    return runWithContext(who as never, () => service.getVisible(U(label)));
  };

  it('opens a live or closed stall to anyone', async () => {
    for (const who of [anonymous, customer, vendorB, vendorNoProfile]) {
      expect(L((await get(who, 's-live')).id)).toBe('s-live');
      expect(L((await get(who, 's-closed')).id)).toBe('s-closed');
    }
  });

  it('is NotFound for a stall in review, suspended or a draft — to everyone but the desk and its owner', async () => {
    for (const label of ['s-review', 's-draft', 's-suspended']) {
      const owner = label === 's-review' ? vendorA : vendorB;
      const stranger = label === 's-review' ? vendorB : vendorA;
      for (const who of [anonymous, customer, stranger, vendorNoProfile]) {
        await expect(get(who, label), label).rejects.toBeInstanceOf(NotFoundError);
      }
      for (const who of [owner, admin, operator, job]) {
        expect(L((await get(who, label)).id), label).toBe(label);
      }
    }
  });

  it('keeps the loader the platform’s own flows use unfiltered', async () => {
    const { service } = storesWorld();
    const row = await runWithContext(customer, () => service.get(U('s-review')));
    expect(L(row.id)).toBe('s-review');
  });
});

describe('the store card', () => {
  const card = (label: string, viewer: Viewer) => {
    const { stores } = storesWorld();
    const row = stores.find((s) => s.id === U(label)) as never;
    return toStoreView(row, true, viewer) as unknown as Record<string, unknown>;
  };

  it('does not hand the vendor’s id to a stranger', () => {
    expect(card('s-live', ANONYMOUS)).not.toHaveProperty('vendorId');
    expect(card('s-live', { staff: false, vendorId: B })).not.toHaveProperty('vendorId');
    expect(card('s-live', { staff: false })).not.toHaveProperty('vendorId');
    // Still a full card otherwise.
    expect(card('s-live', ANONYMOUS)).toMatchObject({ status: 'ACTIVE', isOpen: true });
  });

  it('keeps it for the desk and for the stall’s own vendor', () => {
    expect(card('s-live', { staff: true })).toMatchObject({ vendorId: A });
    expect(card('s-live', { staff: false, vendorId: A })).toMatchObject({ vendorId: A });
  });

  it('is what the endpoints answer with, item by item', async () => {
    const { controller } = storesWorld();
    const reply = {} as never;
    const list = (who: unknown) =>
      runWithContext(who as never, async () => {
        const result = await controller.list({ query: { page: 1, pageSize: 20 } } as never, reply);
        return result.data as unknown as Record<string, unknown>[];
      });
    for (const item of await list(anonymous)) expect(item).not.toHaveProperty('vendorId');
    const own = await list(vendorA);
    expect(own.find((i) => i.id === U('s-live'))).toMatchObject({ vendorId: A });
    expect(own.find((i) => i.id === U('s-b-live'))).not.toHaveProperty('vendorId');

    const one = await runWithContext(anonymous, () =>
      controller.get({ params: { id: U('s-live') } } as never, reply),
    );
    expect(one.data).not.toHaveProperty('vendorId');
    await expect(
      runWithContext(anonymous, () =>
        controller.get({ params: { id: U('s-review') } } as never, reply),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ================================================================ GET /products

function productsWorld() {
  const w = world();
  const repository = new ProductsRepository(w.prisma);
  const service = new ProductsService({
    repository,
    stores: {} as never,
    cache: {} as never,
    logger,
    events,
  } as never);
  return { ...w, repository, service };
}

const listProducts = (who: unknown, query: Record<string, unknown> = {}) => {
  const { service } = productsWorld();
  const filters = parseOrThrow(productsListQuerySchema, query);
  return runWithContext(who as never, async () => labelsOf(await service.list(filters)));
};

const storeQuery = (label: string, extra: Record<string, unknown> = {}) => ({
  storeId: U(label),
  ...extra,
});

describe('GET /products', () => {
  it('shows a customer or a stranger only goods on sale in stalls the public may see', async () => {
    for (const who of [customer, vendorNoProfile]) {
      expect(await listProducts(who)).toEqual(['p-live', 'p-b-live']);
    }
  });

  it('does not let the filters widen that', async () => {
    for (const who of [customer, vendorNoProfile]) {
      // A stall in review, suspended or gone: nothing, whatever storeId says.
      for (const label of ['s-review', 's-suspended', 's-draft', 's-gone', 's-foreign']) {
        expect(await listProducts(who, storeQuery(label)), label).toEqual([]);
      }
      // Switched-off goods stay off the list, `availableOnly=false` or not.
      expect(await listProducts(who, storeQuery('s-b-live', { availableOnly: 'false' }))).toEqual([
        'p-b-live',
      ]);
    }
  });

  it('gives a vendor their own shelf in every state, and the others’ only on sale', async () => {
    // The seller app: `GET /products?storeId=<own>` with no flag, every good, sold out ones too.
    expect(await listProducts(vendorA, storeQuery('s-live'))).toEqual(['p-live', 'p-live-off']);
    expect(await listProducts(vendorA, storeQuery('s-live', { availableOnly: 'false' }))).toEqual([
      'p-live',
      'p-live-off',
    ]);
    expect(await listProducts(vendorA, storeQuery('s-live', { availableOnly: 'true' }))).toEqual([
      'p-live',
    ]);
    // The stall that is still in review is theirs to stock.
    expect(await listProducts(vendorA, storeQuery('s-review'))).toEqual(['p-review']);
    // Another vendor's shelf is the shop window.
    expect(await listProducts(vendorA, storeQuery('s-b-live'))).toEqual(['p-b-live']);
    expect(await listProducts(vendorA, storeQuery('s-suspended'))).toEqual([]);
    // Without a storeId: their own, plus what the public sees of the rest.
    expect(await listProducts(vendorA)).toEqual(['p-live', 'p-live-off', 'p-review', 'p-b-live']);
  });

  it('gives the desk everything the tenant has that is not removed', async () => {
    for (const who of [admin, operator, job]) {
      expect(await listProducts(who)).toEqual([
        'p-live',
        'p-live-off',
        'p-review',
        'p-suspended',
        'p-b-live',
        'p-b-off',
        'p-gone-store',
      ]);
    }
  });
});

describe('GET /products/:id', () => {
  const get = (who: unknown, label: string) => {
    const { service } = productsWorld();
    return runWithContext(who as never, () => service.getVisible(U(label)));
  };

  it('opens a good on sale in a public stall to anyone signed in', async () => {
    for (const who of [customer, vendorB, vendorNoProfile]) {
      expect(L((await get(who, 'p-live')).id)).toBe('p-live');
    }
  });

  it('is NotFound for the rest, so an id cannot be probed', async () => {
    for (const who of [customer, vendorC, vendorNoProfile]) {
      for (const label of ['p-live-off', 'p-review', 'p-suspended', 'p-removed', 'p-gone-store']) {
        await expect(get(who, label), label).rejects.toBeInstanceOf(NotFoundError);
      }
    }
  });

  it('shows the owner their own in any state and the desk all of it', async () => {
    expect(L((await get(vendorA, 'p-live-off')).id)).toBe('p-live-off');
    expect(L((await get(vendorA, 'p-review')).id)).toBe('p-review');
    expect(L((await get(admin, 'p-suspended')).id)).toBe('p-suspended');
    // …not what was removed, whoever asks.
    await expect(get(admin, 'p-removed')).rejects.toBeInstanceOf(NotFoundError);
    await expect(get(vendorA, 'p-removed')).rejects.toBeInstanceOf(NotFoundError);
    // …and not another vendor's switched-off good.
    await expect(get(vendorA, 'p-b-off')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('GET /products/:id, through the controller', () => {
  it('answers with the visible reader: the owner’s good in review, a stranger gets NotFound', async () => {
    const controller = new ProductsController(productsWorld().service);
    const ask = (who: unknown, label: string) =>
      runWithContext(who as never, () =>
        controller.get({ params: { id: U(label) } } as never, {} as never),
      );
    expect(((await ask(vendorA, 'p-review')).data as { id: string }).id).toBe(U('p-review'));
    await expect(ask(customer, 'p-review')).rejects.toBeInstanceOf(NotFoundError);
    await expect(ask(vendorC, 'p-live-off')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ================================================================ products: writes

/** The service on top of the real repository, over a fake Prisma that remembers what it was told. */
function writes() {
  const w = world();
  const wrote: { op: string; args: Row }[] = [];
  const base = w.prisma as unknown as Record<string, Record<string, unknown>>;
  const row = w.products.find((p) => p.id === U('p-live')) as Row;
  const prisma = {
    ...base,
    product: {
      ...base.product,
      async findFirstOrThrow() {
        return { price: 1000, currency: 'UZS' };
      },
      async update(args: Row) {
        wrote.push({ op: 'product.update', args });
        return { ...row, images: [] };
      },
      async create(args: Row) {
        wrote.push({ op: 'product.create', args });
        return { ...row, images: [] };
      },
    },
    productPrice: {
      async findMany(args: Row) {
        wrote.push({ op: 'price.read', args });
        return [{ price: 1000, changedBy: 'user-1' }];
      },
    },
    category: {
      async findUnique({ where }: { where: { id: string } }) {
        return where.id === U('cat-fruit')
          ? { slug: 'fruit' }
          : where.id === U('cat-alcohol')
            ? { slug: 'alcohol' }
            : null;
      },
    },
    productImage: { async deleteMany() {}, async createMany() {} },
    $transaction: async (ops: unknown[]) => ops,
  } as never;
  const repository = new ProductsRepository(prisma);
  const stores = {
    async get(id: string) {
      const found = w.stores.find((s) => s.id === id);
      if (found === undefined) throw new NotFoundError('Store', id);
      return found;
    },
  };
  const service = new ProductsService({
    repository,
    stores,
    cache: { async invalidateByTag() {} },
    logger,
    events,
  } as never);
  return { service, wrote };
}

const newProduct = (storeLabel: string, over: Record<string, unknown> = {}) =>
  ({
    storeId: U(storeLabel),
    name: { ru: 'Яблоки' },
    unit: 'KG',
    price: { amount: 12000, currency: 'UZS' },
    images: [{ url: 'https://cdn.example/a.jpg' }],
    ...over,
  }) as never;

describe('products: who may write to which shelf', () => {
  it('lets a vendor stock their own stall, and the admin any stall of the tenant', async () => {
    for (const who of [vendorA, admin]) {
      const { service, wrote } = writes();
      await runWithContext(who, () => service.create(newProduct('s-live')));
      expect(
        wrote.map((w) => w.op),
        'create',
      ).toEqual(['product.create']);
    }
  });

  it('lets the admin change, switch and remove goods of any stall', async () => {
    const { service, wrote } = writes();
    await runWithContext(admin, () =>
      service.update(U('p-live'), { price: { amount: 15000, currency: 'UZS' } }),
    );
    await runWithContext(admin, () => service.setAvailability(U('p-live'), false));
    await runWithContext(admin, () => service.remove(U('p-live')));
    expect(wrote.filter((w) => w.op === 'product.update')).toHaveLength(3);
  });

  it('refuses another stall’s vendor, a token with no vendor profile, a customer and the operator', async () => {
    for (const who of [vendorB, vendorNoProfile, customer, operator]) {
      const { service, wrote } = writes();
      const id = U('p-live');
      await expect(
        runWithContext(who, () => service.create(newProduct('s-live'))),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        runWithContext(who, () => service.update(id, { price: { amount: 1, currency: 'UZS' } })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        runWithContext(who, () => service.setAvailability(id, false)),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(runWithContext(who, () => service.remove(id))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(wrote, 'nothing was written').toEqual([]);
    }
  });

  it('does not let a vendor put a product into another vendor’s stall, or into a stall that is not there', async () => {
    const { service, wrote } = writes();
    await expect(
      runWithContext(vendorB, () => service.create(newProduct('s-review'))),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(vendorB, () => service.create(newProduct('s-nowhere'))),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(wrote).toEqual([]);
  });

  it('cannot move a product to another stall, or set what is not the seller’s, through the update body', async () => {
    const { service, wrote } = writes();
    await runWithContext(vendorA, () =>
      service.update(U('p-live'), {
        price: { amount: 15000, currency: 'UZS' },
        stock: 4,
        available: false,
        // None of these is on the update schema; a body that smuggles them past it gets nowhere.
        storeId: U('s-b-live'),
        tenantId: 't2',
        rating: 5,
        reviewCount: 999,
        deletedAt: null,
      } as never),
    );
    const update = wrote.find((w) => w.op === 'product.update');
    const data = update?.args.data as Row;
    expect(data).toMatchObject({ price: 15000, stock: 4, available: false });
    for (const key of ['storeId', 'tenantId', 'rating', 'reviewCount', 'deletedAt']) {
      expect(data, key).not.toHaveProperty(key);
    }
    // The write is addressed to the tenant's row, not to an id alone.
    expect(update?.args.where).toEqual({ id: U('p-live'), tenantId: T });
  });

  it('knows its category: an unknown one is NotFound, alcohol is refused', async () => {
    const { service, wrote } = writes();
    await expect(
      runWithContext(vendorA, () =>
        service.create(newProduct('s-live', { categoryId: U('nope') })),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContext(vendorA, () =>
        service.update(U('p-live'), { categoryId: U('cat-alcohol') } as never),
      ),
    ).rejects.toThrow('not sold');
    expect(wrote).toEqual([]);
    await runWithContext(vendorA, () =>
      service.create(newProduct('s-live', { categoryId: U('cat-fruit') })),
    );
    expect(wrote.map((w) => w.op)).toEqual(['product.create']);
  });
});

describe('GET /products/:id/price-history', () => {
  it('is for the stall that owns the product and the desk', async () => {
    for (const who of [vendorA, admin]) {
      const { service } = writes();
      expect(await runWithContext(who, () => service.priceHistory(U('p-live')))).toHaveLength(1);
    }
  });

  it('is refused to any other vendor — `product:write` is held by all of them', async () => {
    for (const who of [vendorB, vendorNoProfile, customer, operator]) {
      const { service, wrote } = writes();
      await expect(
        runWithContext(who, () => service.priceHistory(U('p-live'))),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(wrote, 'no history was read').toEqual([]);
    }
  });

  it('is NotFound for a product that is not there, and tenant-scoped when it is read', async () => {
    const { service, wrote } = writes();
    await expect(
      runWithContext(vendorA, () => service.priceHistory(U('p-nope'))),
    ).rejects.toBeInstanceOf(NotFoundError);
    await runWithContext(vendorA, () => service.priceHistory(U('p-live')));
    expect(wrote[0]?.args.where).toEqual({ productId: U('p-live'), product: { tenantId: T } });
  });
});

// ================================================================ the catalog

function catalogWorld() {
  const w = world();
  const repository = new CatalogRepository(w.prisma);
  const service = new CatalogService({ repository, cache: {} as never, logger, events } as never);
  return { ...w, repository, service };
}

const searchCatalog = (who: unknown, query: Record<string, unknown> = {}) => {
  const { service } = catalogWorld();
  const filters = parseOrThrow(catalogSearchQuerySchema, query);
  return runWithContext(who as never, async () => labelsOf(await service.search(filters)));
};

describe('GET /catalog', () => {
  it('shows nobody the goods of a stall in review, suspended, a draft or gone', async () => {
    for (const who of [anonymous, customer, vendorC, vendorNoProfile]) {
      const byId = await searchCatalog(who, {
        availableOnly: 'false',
        ids: ['p-review', 'p-suspended', 'p-gone-store', 'p-live'].map(U),
      });
      expect(byId, 'by id').toEqual(['p-live']);
      expect(await searchCatalog(who)).toEqual(['p-live', 'p-b-live']);
      for (const label of ['s-review', 's-suspended', 's-draft', 's-gone']) {
        const query = storeQuery(label, { availableOnly: 'false' });
        expect(await searchCatalog(who, query), label).toEqual([]);
      }
    }
  });

  it('lists switched-off goods to the public only by id — the basket’s lines, sold out ones too', async () => {
    for (const who of [anonymous, customer]) {
      const ids = ['p-live', 'p-live-off'].map(U);
      expect(await searchCatalog(who, { ids, availableOnly: 'false' })).toEqual([
        'p-live',
        'p-live-off',
      ]);
      // Browsing a stall with the flag does not turn the sold-out shelf into a list.
      expect(await searchCatalog(who, storeQuery('s-live', { availableOnly: 'false' }))).toEqual([
        'p-live',
      ]);
      // Without the flag the basket's lookup hides what is switched off, as it always did.
      expect(await searchCatalog(who, { ids })).toEqual(['p-live']);
    }
  });

  it('shows the owner their own stall’s goods wherever it stands, and the desk everything', async () => {
    expect(await searchCatalog(vendorA, storeQuery('s-review'))).toEqual(['p-review']);
    expect(await searchCatalog(vendorA, storeQuery('s-live', { availableOnly: 'false' }))).toEqual([
      'p-live',
      'p-live-off',
    ]);
    expect(await searchCatalog(vendorB, storeQuery('s-review'))).toEqual([]);
    expect(await searchCatalog(admin, storeQuery('s-suspended'))).toEqual(['p-suspended']);
  });

  it('opens one product by id like the storefront does, and not one from a hidden stall', async () => {
    const open = (who: unknown, label: string) => {
      const { service } = catalogWorld();
      return runWithContext(who as never, () => service.get(U(label)));
    };
    // A sold-out good keeps its page: a link someone sent, a line in a basket.
    for (const who of [anonymous, customer, vendorC]) {
      expect(L((await open(who, 'p-live-off')).id)).toBe('p-live-off');
      for (const label of ['p-review', 'p-suspended', 'p-gone-store', 'p-removed']) {
        await expect(open(who, label), label).rejects.toBeInstanceOf(NotFoundError);
      }
    }
    expect(L((await open(vendorA, 'p-review')).id)).toBe('p-review');
    expect(L((await open(admin, 'p-suspended')).id)).toBe('p-suspended');
  });

  it('puts into a basket nothing from a stall the public cannot see', async () => {
    const { repository } = catalogWorld();
    const purchasable = (storeLabel: string, productLabels: string[]) =>
      runWithContext(customer, async () => {
        const found = await repository.findPurchasable(U(storeLabel), productLabels.map(U));
        return [...found.keys()].map(L);
      });
    // The live stall sells what is on sale…
    expect(await purchasable('s-live', ['p-live', 'p-live-off'])).toEqual(['p-live']);
    // …the others sell nothing, whatever their goods say.
    expect(await purchasable('s-review', ['p-review'])).toEqual([]);
    expect(await purchasable('s-suspended', ['p-suspended'])).toEqual([]);
    expect(await purchasable('s-gone', ['p-gone-store'])).toEqual([]);
  });
});

// ================================================================ categories

describe('categories of one stall', () => {
  function shelves() {
    const w = world();
    const listed: Row[] = [];
    const cached = new Map<string, unknown>();
    const prisma = {
      store: (w.prisma as unknown as { store: unknown }).store,
      category: {
        async findMany(args: Row) {
          listed.push(args);
          return [{ id: U('cat-1'), parentId: null, active: true, slug: 'fruit', name: {} }];
        },
        async findUnique({ where }: { where: { id: string } }) {
          return {
            id: where.id,
            active: where.id === U('cat-on'),
            slug: where.id,
            path: where.id,
            name: {},
          };
        },
      },
    } as never;
    const service = new CategoriesService({
      repository: new CategoriesRepository(prisma),
      cache: {
        async get(key: string) {
          return cached.get(key) ?? null;
        },
        async set(key: string, value: unknown) {
          cached.set(key, value);
        },
        async invalidateByTag() {},
      },
      logger,
      events,
    } as never);
    return { service, listed, cached };
  }

  it('is empty for a stall the viewer may not see, and leaves nothing in the shared cache', async () => {
    for (const who of [anonymous, customer, vendorC, vendorNoProfile]) {
      const { service, listed, cached } = shelves();
      expect(await runWithContext(who, () => service.tree(U('s-review')))).toEqual([]);
      expect(await runWithContext(who, () => service.tree(U('s-suspended')))).toEqual([]);
      expect(await runWithContext(who, () => service.tree(U('s-foreign')))).toEqual([]);
      expect(listed, 'the table was never read').toEqual([]);
      expect(cached.size).toBe(0);
    }
  });

  it('lists the shelves of a stall the viewer may see', async () => {
    const cases = [
      [anonymous, 's-live'],
      [customer, 's-closed'],
      [vendorA, 's-review'],
      [admin, 's-suspended'],
    ] as const;
    for (const [who, label] of cases) {
      const { service } = shelves();
      expect(await runWithContext(who, () => service.tree(U(label))), label).toHaveLength(1);
    }
  });

  it('shows a switched-off category only to whoever manages categories', async () => {
    const read = (who: unknown, label: string) => {
      const { service } = shelves();
      return runWithContext(who as never, () => service.getVisible(U(label)));
    };
    expect(L((await read(anonymous, 'cat-on')).id)).toBe('cat-on');
    for (const who of [anonymous, customer, vendorA]) {
      await expect(read(who, 'cat-off')).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(L((await read(admin, 'cat-off')).id)).toBe('cat-off');
  });

  it('is what GET /categories/:id and its subtree answer with', async () => {
    const { service } = shelves();
    const controller = new CategoriesController(service);
    const ask = (who: unknown, method: 'get' | 'subtree', label: string) =>
      runWithContext(who as never, () =>
        controller[method]({ params: { id: U(label) } } as never, {} as never),
      );
    for (const method of ['get', 'subtree'] as const) {
      await expect(ask(anonymous, method, 'cat-off')).rejects.toBeInstanceOf(NotFoundError);
      await expect(ask(customer, method, 'cat-off')).rejects.toBeInstanceOf(NotFoundError);
      await ask(anonymous, method, 'cat-on');
    }
    await ask(admin, 'get', 'cat-off');
  });
});
