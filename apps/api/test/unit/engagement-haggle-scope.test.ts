/**
 * Asking for a discount looked the product up by id alone, so a customer could haggle over a good of
 * another tenant, or over one in a stall the public cannot see (still in review, suspended, a shut
 * vendor's), and the stall's owner would be notified about it. The lookup now carries the caller's
 * tenant and the same stall window the shelf shows (`purchasableStoreWhere`).
 *
 * The fake prisma keeps a few products and answers `findFirst` by actually applying the `where` it is
 * given, so the outcome is judged, not only the shape of the query.
 */
import { effectivePermissions } from '@bazar/auth';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { registerErrorHandler } from '../../src/middleware/error-handler.middleware.js';
import { purchasableStoreWhere } from '../../src/modules/catalog/domain/visibility.js';
import { HaggleService } from '../../src/modules/haggle/service/haggle.service.js';
import { storesRoutes } from '../../src/modules/stores/routes/stores.routes.js';

const as = (tenantId: string) =>
  ({
    ...systemContext(tenantId, 'r1', 'ru'),
    system: undefined,
    user: {
      id: 'user-cust-1',
      tenantId,
      roles: ['CUSTOMER'],
      permissions: effectivePermissions(['CUSTOMER']),
      customerId: 'cust-1',
    },
  }) as never;

const asCustomer = as('t1');

// ------------------------------------------------------------------ the shelf

interface StoreRow {
  deletedAt: Date | null;
  status: string;
  vendorId: string;
  name: unknown;
  vendor: { status: string };
}

const stall = (extra: Partial<StoreRow> = {}): StoreRow => ({
  deletedAt: null,
  status: 'ACTIVE',
  vendorId: 'vendor-1',
  name: 'Ряд 12',
  vendor: { status: 'APPROVED' },
  ...extra,
});

const product = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId: 't1',
  storeId: `store-of-${id}`,
  deletedAt: null,
  available: true,
  price: 10_000,
  currency: 'UZS',
  name: { ru: 'Яблоки' },
  store: stall(),
  ...extra,
});

const PRODUCTS = [
  product('p-open'),
  product('p-closed-for-now', { store: stall({ status: 'CLOSED' }) }),
  product('p-other-tenant', { tenantId: 't2' }),
  product('p-draft-stall', { store: stall({ status: 'DRAFT' }) }),
  product('p-in-review-stall', { store: stall({ status: 'PENDING_REVIEW' }) }),
  product('p-suspended-stall', { store: stall({ status: 'SUSPENDED' }) }),
  product('p-removed-stall', { store: stall({ deletedAt: new Date('2026-05-01') }) }),
  product('p-suspended-vendor', { store: stall({ vendor: { status: 'SUSPENDED' } }) }),
  product('p-rejected-vendor', { store: stall({ vendor: { status: 'REJECTED' } }) }),
  product('p-removed', { deletedAt: new Date('2026-05-01') }),
  product('p-sold-out', { available: false }),
];

/** Just enough of Prisma's where to judge the rows above: equality, `in`, `notIn`, relations. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
      return value === condition;
    }
    const clause = condition as Record<string, unknown>;
    if ('in' in clause) return (clause['in'] as unknown[]).includes(value);
    if ('notIn' in clause) return !(clause['notIn'] as unknown[]).includes(value);
    return (
      value !== null &&
      typeof value === 'object' &&
      matches(value as Record<string, unknown>, clause)
    );
  });
}

function service() {
  const lookups: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  const told: unknown[] = [];
  const svc = new HaggleService({
    prisma: {
      product: {
        async findFirst({ where }: { where: Record<string, unknown> }) {
          lookups.push(where);
          return PRODUCTS.find((row) => matches(row, where)) ?? null;
        },
      },
      discountRequest: {
        async findFirst() {
          return null;
        },
        async create({ data }: { data: Record<string, unknown> }) {
          created.push(data);
          return { id: 'ask-1', ...data };
        },
      },
      vendor: {
        async findUnique() {
          return { userId: 'user-vendor-1' };
        },
      },
    },
    queue: {
      async enqueue(...args: unknown[]) {
        told.push(args);
      },
    },
    realtime: { async emit() {} },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, lookups, created, told };
}

const ask = (svc: HaggleService, productId: string, who: never = asCustomer) =>
  runWithContext(who, () => svc.ask({ productId, askedPrice: 8_000 }));

describe('asking a stall for a discount', () => {
  it('looks the product up in the caller’s tenant, in a stall the public may buy from', async () => {
    const { svc, lookups } = service();
    await ask(svc, 'p-open');

    expect(lookups).toEqual([
      {
        id: 'p-open',
        tenantId: 't1',
        deletedAt: null,
        available: true,
        store: purchasableStoreWhere(),
      },
    ]);
  });

  it('works for goods of a live stall, and of one that is only closed for now', async () => {
    for (const id of ['p-open', 'p-closed-for-now']) {
      const { svc, created, told } = service();
      await ask(svc, id);
      expect(created, id).toHaveLength(1);
      expect(created[0]).toMatchObject({ tenantId: 't1', customerId: 'cust-1', productId: id });
      // The stall's owner hears about it.
      expect(told, id).toHaveLength(1);
    }
  });

  it('takes the tenant from the caller, not from a fixed one', async () => {
    const { svc, lookups, created } = service();
    // The same row is the other tenant's good: its own customer may ask, ours may not.
    await ask(svc, 'p-other-tenant', as('t2'));
    expect(lookups[0]).toMatchObject({ id: 'p-other-tenant', tenantId: 't2' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ tenantId: 't2' });
  });

  it('is a 404 for a good of another tenant: nothing is created and no stall is told', async () => {
    const { svc, created, told } = service();
    await expect(ask(svc, 'p-other-tenant')).rejects.toBeInstanceOf(NotFoundError);
    expect(created).toEqual([]);
    expect(told).toEqual([]);
  });

  it('is a 404 for a good in a stall the public cannot see, in any of the ways a stall is shut', async () => {
    for (const id of [
      'p-draft-stall',
      'p-in-review-stall',
      'p-suspended-stall',
      'p-removed-stall',
      'p-suspended-vendor',
      'p-rejected-vendor',
    ]) {
      const { svc, created, told } = service();
      await expect(ask(svc, id), id).rejects.toBeInstanceOf(NotFoundError);
      expect(created, id).toEqual([]);
      expect(told, id).toEqual([]);
    }
  });

  it('is still a 404 for a removed or sold-out good, and for one that does not exist', async () => {
    for (const id of ['p-removed', 'p-sold-out', 'p-nobody']) {
      const { svc, created } = service();
      await expect(ask(svc, id), id).rejects.toBeInstanceOf(NotFoundError);
      expect(created, id).toEqual([]);
    }
  });
});

// ------------------------------------------------------------------ the arrivals route

/**
 * `arrivalsSchema` of the stalls routes is private to the module, so it is exercised through the
 * routes it guards. Its `photoUrl` took any URL (javascript:, data:, file:) and the customers of the
 * stall are shown it.
 */
describe('the stall arrivals route (POST /stores/:id/arrivals)', () => {
  const STORE_ID = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';
  const PRODUCT_ID = '7d1c5a90-2b3e-4f6a-9c8d-0e1f2a3b4c5d';
  const everything = new Proxy({}, { get: () => async () => ({ ok: true }) }) as never;

  async function post(payload: Record<string, unknown>): Promise<number> {
    const app = Fastify();
    registerErrorHandler(app);
    app.addHook('onRequest', async (request) => {
      request.user = {
        id: 'user-vendor',
        tenantId: 't1',
        roles: ['VENDOR'],
        permissions: effectivePermissions(['VENDOR']),
        vendorId: 'vendor-1',
      } as never;
    });
    await app.register(storesRoutes(everything), { prefix: '/stores' });
    const response = await app.inject({
      method: 'POST',
      url: `/stores/${STORE_ID}/arrivals`,
      payload,
    });
    await app.close();
    return response.statusCode;
  }

  it('accepts a photo that is an http(s) link, or none', async () => {
    expect(await post({ productIds: [PRODUCT_ID] })).toBe(200);
    expect(
      await post({ productIds: [PRODUCT_ID], photoUrl: 'https://cdn.example.com/a.jpg' }),
    ).toBe(200);
    expect(await post({ productIds: [PRODUCT_ID], photoUrl: 'http://cdn.example.com/a.jpg' })).toBe(
      200,
    );
  });

  it('refuses a photo that is a script, an inline document, a local file or an ftp link', async () => {
    for (const photoUrl of [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'file:///etc/passwd',
      'ftp://example.com/a.jpg',
    ]) {
      expect(await post({ productIds: [PRODUCT_ID], photoUrl }), photoUrl).toBe(422);
    }
  });
});
