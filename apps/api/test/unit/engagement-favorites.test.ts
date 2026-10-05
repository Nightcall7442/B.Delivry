/**
 * «Избранное». A heart is saved only on what the caller may see — a stall in review or the good of
 * a hidden stall answers NotFound here as everywhere else, so a saved id cannot confirm it exists —
 * and only by a customer, for themselves. Saving twice is a no-op settled by the unique pair, not
 * by a read; a heart on a good that has since gone still comes off; and the list is bounded.
 *
 * Real FavoritesService and FavoritesRepository; Prisma, the catalog and the stores are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { FavoritesRepository } from '../../src/modules/favorites/repository/favorites.repository.js';
import {
  FavoritesService,
  MAX_FAVORITES,
} from '../../src/modules/favorites/service/favorites.service.js';

const TENANT = 't1';

const ctx = (user: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const as = (name: string, roles: Role[], ids: { customerId?: string; vendorId?: string } = {}) =>
  ctx({
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  });

const asCustomer = as('cust-1', [ROLE.CUSTOMER], { customerId: 'cust-1' });
const asVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asAnonymous = ctx(null);

const logger = { error() {}, warn() {}, info() {}, debug() {} };

type Row = {
  tenantId: string;
  customerId: string;
  productId: string | null;
  storeId: string | null;
  createdAt: Date;
};

/** The few Prisma calls the repository makes, over an array, with the unique pairs enforced. */
function fakePrisma(rows: Row[] = []) {
  const calls: { op: string; args: unknown }[] = [];
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const field = row[key as keyof Row];
      if (value !== null && typeof value === 'object' && 'not' in value) return field !== null;
      return field === value;
    });
  const favorite = {
    async findMany(args: { where: Record<string, unknown> }) {
      calls.push({ op: 'findMany', args });
      return rows
        .filter((row) => matches(row, args.where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async count(args: { where: Record<string, unknown> }) {
      calls.push({ op: 'count', args });
      return rows.filter((row) => matches(row, args.where)).length;
    },
    async createMany(args: { data: Partial<Row>[]; skipDuplicates: boolean }) {
      calls.push({ op: 'createMany', args });
      let count = 0;
      for (const data of args.data) {
        const row: Row = {
          tenantId: data.tenantId ?? '',
          customerId: data.customerId ?? '',
          productId: data.productId ?? null,
          storeId: data.storeId ?? null,
          createdAt: new Date(Date.now() + rows.length),
        };
        const duplicate = rows.some(
          (r) =>
            r.customerId === row.customerId &&
            ((row.productId !== null && r.productId === row.productId) ||
              (row.storeId !== null && r.storeId === row.storeId)),
        );
        if (duplicate) {
          if (!args.skipDuplicates) throw new Error('unique violation');
          continue;
        }
        rows.push(row);
        count += 1;
      }
      return { count };
    },
    async deleteMany(args: { where: Record<string, unknown> }) {
      calls.push({ op: 'deleteMany', args });
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (row !== undefined && matches(row, args.where)) rows.splice(i, 1);
      }
      return { count: before - rows.length };
    },
  };
  return { prisma: { favorite } as never, rows, calls };
}

const VISIBLE_PRODUCT = 'p-visible';
const VISIBLE_STORE = 's-visible';

function service(rows: Row[] = []) {
  const db = fakePrisma(rows);
  const svc = new FavoritesService({
    repository: new FavoritesRepository(db.prisma),
    catalog: {
      async get(id: string) {
        if (id !== VISIBLE_PRODUCT) throw new NotFoundError('Product', id);
        return { id } as never;
      },
    },
    stores: {
      async getVisible(id: string) {
        if (id !== VISIBLE_STORE) throw new NotFoundError('Store', id);
        return { id } as never;
      },
    },
    logger,
    events: { async publish() {} },
  } as never);
  return { svc, ...db };
}

const row = (over: Partial<Row>): Row => ({
  tenantId: TENANT,
  customerId: 'cust-1',
  productId: null,
  storeId: null,
  createdAt: new Date(),
  ...over,
});

describe('saving a heart', () => {
  it('saves a good and a stall the customer can see, for that customer, in their tenant', async () => {
    const { svc, rows } = service();
    await runWithContext(asCustomer, async () => {
      await svc.add('product', VISIBLE_PRODUCT);
      await svc.add('store', VISIBLE_STORE);
    });
    expect(rows).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        customerId: 'cust-1',
        productId: VISIBLE_PRODUCT,
        storeId: null,
      }),
      expect.objectContaining({
        tenantId: TENANT,
        customerId: 'cust-1',
        productId: null,
        storeId: VISIBLE_STORE,
      }),
    ]);
  });

  it('answers NotFound for what the caller may not see, and saves nothing', async () => {
    const { svc, rows } = service();
    await expect(
      runWithContext(asCustomer, () => svc.add('product', 'p-of-a-hidden-stall')),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContext(asCustomer, () => svc.add('store', 's-in-review')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rows).toEqual([]);
  });

  it('is a no-op the second time: the unique pair settles it, not a read before the write', async () => {
    const { svc, rows, calls } = service();
    await runWithContext(asCustomer, async () => {
      await svc.add('product', VISIBLE_PRODUCT);
      await svc.add('product', VISIBLE_PRODUCT);
    });
    expect(rows).toHaveLength(1);
    const creates = calls.filter((call) => call.op === 'createMany');
    expect(creates.every((call) => (call.args as { skipDuplicates: boolean }).skipDuplicates)).toBe(
      true,
    );
  });

  it('is for customers only: no vendor profile hearts, no anonymous ones', async () => {
    const { svc, rows } = service();
    await expect(
      runWithContext(asVendor, () => svc.add('product', VISIBLE_PRODUCT)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asAnonymous, () => svc.add('product', VISIBLE_PRODUCT)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(rows).toEqual([]);
  });

  it(`stops at ${MAX_FAVORITES} of a kind`, async () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => row({ productId: `p-${i}` }));
    const { svc, rows } = service(full);
    await expect(
      runWithContext(asCustomer, () => svc.add('product', VISIBLE_PRODUCT)),
    ).rejects.toBeInstanceOf(ConflictError);
    // Goods and stalls are counted apart: a full list of goods leaves room for a stall.
    await runWithContext(asCustomer, () => svc.add('store', VISIBLE_STORE));
    expect(rows).toHaveLength(MAX_FAVORITES + 1);
  });
});

describe('the list and taking a heart off', () => {
  it('lists the caller’s own hearts in their tenant, newest first, goods and stalls apart', async () => {
    const old = new Date(Date.now() - 60_000);
    const { svc, calls } = service([
      row({ productId: 'p-old', createdAt: old }),
      row({ productId: 'p-new' }),
      row({ storeId: 's-1' }),
      row({ customerId: 'cust-2', productId: 'p-of-someone-else' }),
      row({ tenantId: 't2', productId: 'p-of-another-tenant' }),
    ]);
    const list = await runWithContext(asCustomer, () => svc.list());
    expect(list).toEqual({ productIds: ['p-new', 'p-old'], storeIds: ['s-1'] });
    expect(calls[0]?.args).toMatchObject({ where: { customerId: 'cust-1', tenantId: TENANT } });
  });

  it('takes a heart off a good that has since gone, and only the caller’s own', async () => {
    const { svc, rows } = service([
      row({ productId: 'p-gone' }),
      row({ customerId: 'cust-2', productId: 'p-gone' }),
    ]);
    await runWithContext(asCustomer, () => svc.remove('product', 'p-gone'));
    expect(rows).toEqual([expect.objectContaining({ customerId: 'cust-2', productId: 'p-gone' })]);
  });
});
