/**
 * A cart subscription is a standing instruction to place a real order every week on the platform's
 * own initiative, so how many one account may start is bounded, and a scheduler that reads the same
 * table twice (a second tick, a second instance) must not place the same order twice: each due row
 * is claimed before it is handed out. Prices are never in the row; the order is priced when it is
 * placed.
 *
 * Real SubscriptionsService and SubscriptionsRepository; the orders service and Prisma are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext, type RequestContext } from '../../src/common/types/request-context.js';
import { SubscriptionsRepository } from '../../src/modules/subscriptions/repository/subscriptions.repository.js';
import { SubscriptionsService } from '../../src/modules/subscriptions/service/subscriptions.service.js';

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
const asOtherCustomer = as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' });
const asVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asPlatform = systemContext(TENANT, 'job', 'ru');

const logger = { error() {}, warn() {}, info() {}, debug() {} };

function service(existing = 0) {
  const created: Record<string, unknown>[] = [];
  const rows = new Map<
    string,
    { id: string; customerId: string; storeId: string; addressId: string }
  >();
  const repository = {
    async countForCustomer() {
      return existing + created.length;
    },
    async create(data: Record<string, unknown>) {
      created.push(data);
      return { id: `sub-${created.length}`, ...data };
    },
    async findById(id: string, customerId: string) {
      const row = rows.get(id);
      return row !== undefined && row.customerId === customerId ? row : null;
    },
  };
  rows.set('sub-1', { id: 'sub-1', customerId: 'cust-1', storeId: 'store-1', addressId: 'a1' });
  const svc = new SubscriptionsService({
    repository,
    orders: {
      async get() {
        return {
          id: 'o1',
          customerId: 'cust-1',
          storeId: 'store-1',
          addressId: 'a1',
          paymentMethod: 'CASH',
          items: [{ productId: 'p1', name: { ru: 'Помидоры' }, unit: 'KG', quantity: 2 }],
        };
      },
    },
    catalog: {},
    stores: {
      async get() {
        return { name: { ru: 'Лавка' } };
      },
    },
    addresses: {
      async list() {
        return [];
      },
      async getFrozen() {
        return { formatted: 'ул. Мира, 1' };
      },
    },
    notifications: { async send() {}, async sendDirect() {} },
    logger,
    events: { async publish() {} },
  } as never);
  return { svc, created };
}

describe('starting a subscription', () => {
  it('copies the basket of the customer’s own order, with names and quantities and no prices', async () => {
    const { svc, created } = service();
    await runWithContext(asCustomer, () => svc.create({ orderId: 'o1', weekday: 6, hour: 8 }));
    expect(created[0]).toMatchObject({
      customerId: 'cust-1',
      storeId: 'store-1',
      items: [{ productId: 'p1', name: { ru: 'Помидоры' }, unit: 'KG', quantity: 2 }],
    });
    expect(JSON.stringify(created[0]?.['items'])).not.toMatch(/price/i);
  });

  it('is not made from somebody else’s order, and not by a caller with no customer profile', async () => {
    const { svc, created } = service();
    await expect(
      runWithContext(asOtherCustomer, () => svc.create({ orderId: 'o1', weekday: 6, hour: 8 })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asVendor, () => svc.create({ orderId: 'o1', weekday: 6, hour: 8 })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(created).toEqual([]);
  });

  it('stops at ten per customer: each one is a real order placed every week', async () => {
    const { svc, created } = service(9);
    await runWithContext(asCustomer, () => svc.create({ orderId: 'o1', weekday: 6, hour: 8 }));
    await expect(
      runWithContext(asCustomer, () => svc.create({ orderId: 'o1', weekday: 5, hour: 8 })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(created).toHaveLength(1);
  });
});

describe('changing a subscription', () => {
  it('finds the caller’s own and nobody else’s', async () => {
    const { svc } = service();
    await expect(
      runWithContext(asOtherCustomer, () => svc.update('sub-1', { active: false })),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(runWithContext(asOtherCustomer, () => svc.remove('sub-1'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('the subscriptions table', () => {
  const NOW = new Date('2026-10-01T05:00:00Z');
  const LEAD = 2 * 60 * 60_000;
  const row = (id: string, nextRunAt: Date) => ({
    id,
    tenantId: TENANT,
    nextRunAt,
    lastRunAt: null,
  });

  function recording(winners: Set<string>, due: ReturnType<typeof row>[]) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const prisma = {
      cartSubscription: {
        async findMany(args: Record<string, unknown>) {
          calls.push({ op: 'findMany', args });
          return due;
        },
        async updateMany(args: { where: { id: string } }) {
          calls.push({ op: 'updateMany', args });
          return { count: winners.has(args.where.id) ? 1 : 0 };
        },
        async update(args: Record<string, unknown>) {
          calls.push({ op: 'update', args });
          return {};
        },
        async delete(args: Record<string, unknown>) {
          calls.push({ op: 'delete', args });
          return {};
        },
        async count(args: Record<string, unknown>) {
          calls.push({ op: 'count', args });
          return 3;
        },
      },
    };
    return { repository: new SubscriptionsRepository(prisma as never), calls };
  }

  it('hands each due row to one reader only: the row is claimed before it is returned', async () => {
    const opens = new Date(NOW.getTime() + 60 * 60_000);
    const { repository, calls } = recording(new Set(['s1']), [row('s1', opens), row('s2', opens)]);
    // s2 was taken by another tick between the read and the claim.
    const mine = await runWithContext(asPlatform, () => repository.due(NOW, LEAD));
    expect(mine.map((r) => r.id)).toEqual(['s1']);

    const claim = calls.find((c) => c.op === 'updateMany')!;
    expect(claim.args['where']).toMatchObject({ id: 's1', tenantId: TENANT, nextRunAt: opens });
    expect(claim.args['data']).toEqual({ lastRunAt: NOW });
  });

  it('does not offer a row that is claimed and still inside its lease', async () => {
    const { repository, calls } = recording(new Set(), []);
    await runWithContext(asPlatform, () => repository.due(NOW, LEAD));
    const read = calls.find((c) => c.op === 'findMany')!;
    const lapsed = new Date(NOW.getTime() - 10 * 60_000);
    expect(read.args['where']).toMatchObject({
      tenantId: TENANT,
      active: true,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: lapsed } }],
    });
  });

  it('counts, updates, removes and records a run only inside the tenant', async () => {
    const { repository, calls } = recording(new Set(), []);
    await runWithContext(asPlatform, async () => {
      await repository.countForCustomer('cust-1');
      await repository.update('s1', { active: false });
      await repository.remove('s1');
      await repository.markRun('s1', { nextRunAt: NOW, lastOrderId: null, lastError: null });
    });
    expect(calls.map((c) => [c.op, c.args['where']])).toEqual([
      ['count', { customerId: 'cust-1', tenantId: TENANT }],
      ['update', { id: 's1', tenantId: TENANT }],
      ['delete', { id: 's1', tenantId: TENANT }],
      ['update', { id: 's1', tenantId: TENANT }],
    ]);
  });
});
