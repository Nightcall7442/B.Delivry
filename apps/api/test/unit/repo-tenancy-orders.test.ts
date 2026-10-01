/**
 * The orders and delivery repositories write by id. An id that belongs to another tenant must match
 * nothing, so every write names the tenant in its own `where`, next to the guard (the status it moves
 * from, the courier who holds it) that makes the write safe against a racing request. These tests
 * run the real repositories over a Prisma that records every query, so removing the tenant, the guard
 * or the "no such row" answer from a query fails here instead of leaking one tenant's rows to another.
 */
import { describe, expect, it } from 'vitest';
import { NotFoundError, TenantNotResolvedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import {
  ACTIVE_DELIVERY_STATUSES,
  DeliveryRepository,
} from '../../src/modules/delivery/repository/delivery.repository.js';
import { OrdersRepository } from '../../src/modules/orders/repository/orders.repository.js';

interface Call {
  op: string;
  args: Record<string, unknown>;
}

/**
 * Prisma as far as a repository goes: every `model.method(args)` is recorded under that name and
 * answered from `answers` (an Error is thrown), else with `{ count: 1 }` for a bulk write and null.
 */
function recordingPrisma(answers: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fallback: Record<string, unknown> = { updateMany: { count: 1 }, deleteMany: { count: 1 } };
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => {
          if (typeof method !== 'string') return undefined;
          return async (args: Record<string, unknown>) => {
            const op = `${name}.${method}`;
            calls.push({ op, args });
            const answer = op in answers ? answers[op] : (fallback[method] ?? null);
            if (answer instanceof Error) throw answer;
            return answer;
          };
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_target, name) =>
        typeof name === 'string' && name !== 'then' ? model(name) : undefined,
    },
  );
  return { prisma, calls };
}

const TENANT = 'tenant-a';
const inTenant = <T>(fn: () => T, tenant = TENANT): T =>
  runWithContext(systemContext(tenant, `req-${tenant}`, 'ru'), fn);

const opsOf = (calls: Call[]) => calls.map((call) => call.op);
const whereOf = (call: Call | undefined) => call?.args['where'];

/** Every `tenantId` named anywhere in a `where`, nested relation filters included. */
function tenantIdsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(tenantIdsIn);
  if (typeof value !== 'object' || value === null || value instanceof Date) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === 'tenantId' && typeof inner === 'string' ? [inner] : tenantIdsIn(inner),
  );
}

interface Probe<R> {
  name: string;
  /** The query whose `where` has to name the tenant. */
  op: string;
  answers?: Record<string, unknown>;
  run: (repo: R) => Promise<unknown>;
}

/**
 * The tenant is read from the request that is running the call, at the moment of the call: the same
 * repository used for two tenants names each one, and with no request there is no query at all.
 */
function tenantFromTheRequest<R>(
  label: string,
  build: (answers: Record<string, unknown>) => { repo: R; calls: Call[] },
  probes: Probe<R>[],
) {
  describe(`${label}: the tenant is the one of the request that is running`, () => {
    for (const probe of probes) {
      it(`${probe.name} names the tenant of each call, and does not run without one`, async () => {
        const { repo, calls } = build(probe.answers ?? {});
        await inTenant(() => probe.run(repo), 'tenant-a');
        await inTenant(() => probe.run(repo), 'tenant-b');
        const guarded = calls.filter((call) => call.op === probe.op);
        expect(guarded.map((call) => tenantIdsIn(whereOf(call)))).toEqual([
          ['tenant-a'],
          ['tenant-b'],
        ]);

        const bare = build(probe.answers ?? {});
        await expect(probe.run(bare.repo)).rejects.toBeInstanceOf(TenantNotResolvedError);
        expect(bare.calls).toEqual([]);
      });
    }
  });
}

// ------------------------------------------------------------------------------------------ orders

function orders(answers: Record<string, unknown> = {}) {
  const { prisma, calls } = recordingPrisma(answers);
  return { repo: new OrdersRepository(prisma as never), calls };
}

describe('OrdersRepository.applyStatus', () => {
  it('is a compare-and-swap in the tenant: only this tenant’s order that is still in the status it moves from', async () => {
    const moved = { id: 'o1', status: 'CONFIRMED' };
    const { repo, calls } = orders({ 'order.findUnique': moved });

    const result = await inTenant(() =>
      repo.applyStatus('o1', 'PENDING', 'CONFIRMED', 'user-1', 'ok'),
    );

    expect(opsOf(calls)).toEqual([
      'order.updateMany',
      'orderStatusHistory.create',
      'order.findUnique',
    ]);
    expect(whereOf(calls[0])).toEqual({ id: 'o1', status: 'PENDING', tenantId: TENANT });
    expect(calls[0]?.args['data']).toEqual({ status: 'CONFIRMED', confirmedAt: expect.any(Date) });
    expect(calls[1]?.args).toEqual({
      data: { orderId: 'o1', status: 'CONFIRMED', actorId: 'user-1', comment: 'ok' },
    });
    expect(calls[2]?.args).toMatchObject({ where: { id: 'o1' } });
    expect(result).toBe(moved);
  });

  it('answers null and writes no history row when nothing matched: another tenant’s order, or one that has already moved', async () => {
    const { repo, calls } = orders({ 'order.updateMany': { count: 0 } });

    await expect(
      inTenant(() => repo.applyStatus('o1', 'PENDING', 'CONFIRMED', 'user-1', null)),
    ).resolves.toBeNull();

    expect(opsOf(calls)).toEqual(['order.updateMany']);
  });

  it('stamps the moment of the moves that have one, and only those', async () => {
    const moveTo = async (
      to: Parameters<OrdersRepository['applyStatus']>[2],
      comment: string | null,
    ) => {
      const { repo, calls } = orders();
      await inTenant(() => repo.applyStatus('o1', 'PENDING', to, null, comment));
      return calls[0]?.args['data'];
    };

    expect(await moveTo('DELIVERED', null)).toEqual({
      status: 'DELIVERED',
      deliveredAt: expect.any(Date),
    });
    expect(await moveTo('CANCELLED', 'changed my mind')).toEqual({
      status: 'CANCELLED',
      cancelledAt: expect.any(Date),
      cancelReason: 'changed my mind',
    });
    expect(await moveTo('PICKED_UP', null)).toEqual({ status: 'PICKED_UP' });
  });

  it('runs on the transaction it is handed and leaves the pool alone', async () => {
    const pool = orders();
    const tx = recordingPrisma();

    await inTenant(() =>
      pool.repo.applyStatus('o1', 'PENDING', 'CONFIRMED', null, null, tx.prisma as never),
    );

    expect(opsOf(tx.calls)).toEqual([
      'order.updateMany',
      'orderStatusHistory.create',
      'order.findUnique',
    ]);
    expect(whereOf(tx.calls[0])).toEqual({ id: 'o1', status: 'PENDING', tenantId: TENANT });
    expect(pool.calls).toEqual([]);
  });
});

describe('OrdersRepository.assignCourier and releaseCourier', () => {
  it('assign the courier to this tenant’s order only', async () => {
    const { repo, calls } = orders();

    await inTenant(() => repo.assignCourier('o1', 'courier-1'));

    expect(opsOf(calls)).toEqual(['order.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'o1', tenantId: TENANT },
      data: { courierId: 'courier-1' },
    });
  });

  it('release the courier from this tenant’s order only', async () => {
    const { repo, calls } = orders();

    await inTenant(() => repo.releaseCourier('o1'));

    expect(opsOf(calls)).toEqual(['order.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'o1', tenantId: TENANT },
      data: { courierId: null },
    });
  });

  it('say the order is not found, instead of succeeding, when the id matched nothing in the tenant', async () => {
    const { repo, calls } = orders({ 'order.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.assignCourier('o9', 'courier-1'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(inTenant(() => repo.assignCourier('o9', 'courier-1'))).rejects.toThrow(
      'Order o9 not found',
    );
    await expect(inTenant(() => repo.releaseCourier('o9'))).rejects.toBeInstanceOf(NotFoundError);
    await expect(inTenant(() => repo.releaseCourier('o9'))).rejects.toThrow('Order o9 not found');
    // Each attempt is a single scoped write: nothing else is read or written to find out.
    expect(new Set(opsOf(calls))).toEqual(new Set(['order.updateMany']));
  });

  it('write on the transaction they are handed, and answer for it', async () => {
    const pool = orders();
    const tx = recordingPrisma();
    const missing = recordingPrisma({ 'order.updateMany': { count: 0 } });

    await inTenant(() => pool.repo.assignCourier('o1', 'courier-1', tx.prisma as never));
    await inTenant(() => pool.repo.releaseCourier('o1', tx.prisma as never));
    expect(opsOf(tx.calls)).toEqual(['order.updateMany', 'order.updateMany']);
    expect(tx.calls.map(whereOf)).toEqual([
      { id: 'o1', tenantId: TENANT },
      { id: 'o1', tenantId: TENANT },
    ]);

    await expect(
      inTenant(() => pool.repo.assignCourier('o1', 'courier-1', missing.prisma as never)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      inTenant(() => pool.repo.releaseCourier('o1', missing.prisma as never)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pool.calls).toEqual([]);
  });
});

describe('OrdersRepository.setEta and setPaymentStatus', () => {
  it('set the estimate on this tenant’s order only', async () => {
    const { repo, calls } = orders();
    const etaAt = new Date('2026-10-01T12:30:00Z');

    await inTenant(() => repo.setEta('o1', etaAt));
    await inTenant(() => repo.setEta('o1', null));

    expect(opsOf(calls)).toEqual(['order.updateMany', 'order.updateMany']);
    expect(calls.map((call) => call.args)).toEqual([
      { where: { id: 'o1', tenantId: TENANT }, data: { etaAt } },
      { where: { id: 'o1', tenantId: TENANT }, data: { etaAt: null } },
    ]);
  });

  it('set the payment status on this tenant’s order only', async () => {
    const { repo, calls } = orders();

    await inTenant(() => repo.setPaymentStatus('o1', 'CAPTURED'));

    expect(opsOf(calls)).toEqual(['order.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'o1', tenantId: TENANT },
      data: { paymentStatus: 'CAPTURED' },
    });
  });

  it('change nothing, and say nothing, for an id that is not this tenant’s order', async () => {
    const { repo, calls } = orders({ 'order.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.setEta('o9', null))).resolves.toBeUndefined();
    await expect(inTenant(() => repo.setPaymentStatus('o9', 'CAPTURED'))).resolves.toBeUndefined();

    expect(new Set(opsOf(calls))).toEqual(new Set(['order.updateMany']));
  });
});

describe('OrdersRepository.unpaidInvoiceTotal', () => {
  it('adds up this tenant’s customer’s open invoices: unpaid, not cancelled or failed', async () => {
    const { repo, calls } = orders({ 'order.aggregate': { _sum: { total: 125_000 } } });

    await expect(inTenant(() => repo.unpaidInvoiceTotal('cust-1'))).resolves.toBe(125_000);

    expect(opsOf(calls)).toEqual(['order.aggregate']);
    expect(calls[0]?.args).toEqual({
      where: {
        tenantId: TENANT,
        customerId: 'cust-1',
        paymentMethod: 'INVOICE',
        paymentStatus: { not: 'CAPTURED' },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _sum: { total: true },
    });
  });

  it('owes nothing when there is nothing open', async () => {
    const { repo } = orders({ 'order.aggregate': { _sum: { total: null } } });

    await expect(inTenant(() => repo.unpaidInvoiceTotal('cust-1'))).resolves.toBe(0);
  });
});

tenantFromTheRequest<OrdersRepository>('OrdersRepository', orders, [
  {
    name: 'applyStatus',
    op: 'order.updateMany',
    run: (repo) => repo.applyStatus('o1', 'PENDING', 'CONFIRMED', null, null),
  },
  { name: 'assignCourier', op: 'order.updateMany', run: (repo) => repo.assignCourier('o1', 'c1') },
  { name: 'releaseCourier', op: 'order.updateMany', run: (repo) => repo.releaseCourier('o1') },
  { name: 'setEta', op: 'order.updateMany', run: (repo) => repo.setEta('o1', null) },
  {
    name: 'setPaymentStatus',
    op: 'order.updateMany',
    run: (repo) => repo.setPaymentStatus('o1', 'CAPTURED'),
  },
  {
    name: 'unpaidInvoiceTotal',
    op: 'order.aggregate',
    answers: { 'order.aggregate': { _sum: { total: null } } },
    run: (repo) => repo.unpaidInvoiceTotal('cust-1'),
  },
]);

// ----------------------------------------------------------------------------------------- delivery

function deliveries(answers: Record<string, unknown> = {}) {
  const { prisma, calls } = recordingPrisma(answers);
  return { repo: new DeliveryRepository(prisma as never), calls };
}

describe('DeliveryRepository.setEta and setHandoverCode', () => {
  it('set the estimate on this tenant’s delivery only', async () => {
    const { repo, calls } = deliveries();
    const etaAt = new Date('2026-10-01T12:30:00Z');

    await inTenant(() => repo.setEta('d1', etaAt));
    await inTenant(() => repo.setEta('d1', null));

    expect(opsOf(calls)).toEqual(['delivery.updateMany', 'delivery.updateMany']);
    expect(calls.map((call) => call.args)).toEqual([
      { where: { id: 'd1', tenantId: TENANT }, data: { etaAt } },
      { where: { id: 'd1', tenantId: TENANT }, data: { etaAt: null } },
    ]);
  });

  it('set the handover code on this tenant’s delivery only', async () => {
    const { repo, calls } = deliveries();

    await inTenant(() => repo.setHandoverCode('d1', '4821'));

    expect(opsOf(calls)).toEqual(['delivery.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'd1', tenantId: TENANT },
      data: { handoverCode: '4821' },
    });
  });

  it('change nothing, and say nothing, for an id that is not this tenant’s delivery', async () => {
    const { repo, calls } = deliveries({ 'delivery.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.setEta('d9', null))).resolves.toBeUndefined();
    await expect(inTenant(() => repo.setHandoverCode('d9', '4821'))).resolves.toBeUndefined();

    expect(new Set(opsOf(calls))).toEqual(new Set(['delivery.updateMany']));
  });
});

describe('DeliveryRepository.claim', () => {
  it('takes a delivery nobody holds, in this tenant, and marks the courier’s offer accepted', async () => {
    const { repo, calls } = deliveries();

    await expect(inTenant(() => repo.claim('d1', 'courier-1'))).resolves.toBe(true);

    expect(opsOf(calls)).toEqual(['delivery.updateMany', 'deliveryOffer.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: {
        id: 'd1',
        courierId: null,
        status: { in: ['PENDING', 'SEARCHING'] },
        tenantId: TENANT,
      },
      data: { courierId: 'courier-1', status: 'ASSIGNED', assignedAt: expect.any(Date) },
    });
    expect(calls[1]?.args).toEqual({
      where: { deliveryId: 'd1', courierId: 'courier-1' },
      data: { acceptedAt: expect.any(Date) },
    });
  });

  it('is false, and accepts no offer, when the delivery is taken, past searching or not this tenant’s', async () => {
    const { repo, calls } = deliveries({ 'delivery.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.claim('d1', 'courier-1'))).resolves.toBe(false);

    expect(opsOf(calls)).toEqual(['delivery.updateMany']);
  });

  it('runs both writes on the transaction it is handed and leaves the pool alone', async () => {
    const pool = deliveries();
    const tx = recordingPrisma();

    await expect(
      inTenant(() => pool.repo.claim('d1', 'courier-1', tx.prisma as never)),
    ).resolves.toBe(true);

    expect(opsOf(tx.calls)).toEqual(['delivery.updateMany', 'deliveryOffer.updateMany']);
    expect(tenantIdsIn(whereOf(tx.calls[0]))).toEqual([TENANT]);
    expect(pool.calls).toEqual([]);
  });
});

describe('DeliveryRepository offers', () => {
  it('decline turns down only an offer still open, on a delivery of this tenant', async () => {
    const { repo, calls } = deliveries();

    await inTenant(() => repo.decline('d1', 'courier-1'));

    expect(opsOf(calls)).toEqual(['deliveryOffer.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: {
        deliveryId: 'd1',
        courierId: 'courier-1',
        acceptedAt: null,
        delivery: { tenantId: TENANT },
      },
      data: { declinedAt: expect.any(Date) },
    });
  });

  it('clearOffers forgets only the offers nobody accepted, on a delivery of this tenant', async () => {
    const { repo, calls } = deliveries();

    await inTenant(() => repo.clearOffers('d1'));

    expect(opsOf(calls)).toEqual(['deliveryOffer.deleteMany']);
    expect(calls[0]?.args).toEqual({
      where: { deliveryId: 'd1', acceptedAt: null, delivery: { tenantId: TENANT } },
    });
  });

  it('findOffer looks only at an offer on a delivery of this tenant', async () => {
    const offer = { deliveryId: 'd1', courierId: 'courier-1' };
    const { repo, calls } = deliveries({ 'deliveryOffer.findFirst': offer });

    await expect(inTenant(() => repo.findOffer('d1', 'courier-1'))).resolves.toBe(offer);

    expect(opsOf(calls)).toEqual(['deliveryOffer.findFirst']);
    expect(calls[0]?.args).toEqual({
      where: { deliveryId: 'd1', courierId: 'courier-1', delivery: { tenantId: TENANT } },
    });
  });
});

describe('DeliveryRepository.transition', () => {
  it('moves a trip only from the statuses named, while it is still this courier’s, in this tenant', async () => {
    const { repo, calls } = deliveries();

    await expect(
      inTenant(() => repo.transition('d1', 'courier-1', ['ASSIGNED', 'AT_PICKUP'], 'PICKED_UP')),
    ).resolves.toBe(true);

    expect(opsOf(calls)).toEqual(['delivery.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: {
        id: 'd1',
        courierId: 'courier-1',
        status: { in: ['ASSIGNED', 'AT_PICKUP'] },
        tenantId: TENANT,
      },
      data: { status: 'PICKED_UP' },
    });
  });

  it('writes what the caller adds, but the status it names is the one that lands', async () => {
    const { repo, calls } = deliveries();
    const pickedUpAt = new Date('2026-10-01T10:00:00Z');

    await inTenant(() =>
      repo.transition('d1', 'courier-1', ['AT_PICKUP'], 'PICKED_UP', {
        pickedUpAt,
        status: 'FAILED',
      }),
    );

    expect(calls[0]?.args['data']).toEqual({ pickedUpAt, status: 'PICKED_UP' });
  });

  it('is false when the trip is not in one of those statuses, no longer the courier’s or not this tenant’s', async () => {
    const { repo } = deliveries({ 'delivery.updateMany': { count: 0 } });

    await expect(
      inTenant(() => repo.transition('d1', 'courier-1', ['ASSIGNED'], 'AT_PICKUP')),
    ).resolves.toBe(false);
  });
});

describe('DeliveryRepository.release and setSearching', () => {
  it('release hands back only the courier’s own live trip in this tenant, and says whether it did', async () => {
    const { repo, calls } = deliveries();

    await expect(inTenant(() => repo.release('d1', 'courier-1'))).resolves.toBe(true);

    expect(opsOf(calls)).toEqual(['delivery.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: {
        id: 'd1',
        courierId: 'courier-1',
        status: { in: ACTIVE_DELIVERY_STATUSES },
        tenantId: TENANT,
      },
      data: {
        courierId: null,
        status: 'SEARCHING',
        assignedAt: null,
        attemptCount: { increment: 1 },
      },
    });

    const missed = deliveries({ 'delivery.updateMany': { count: 0 } });
    await expect(inTenant(() => missed.repo.release('d1', 'courier-1'))).resolves.toBe(false);
  });

  it('setSearching starts only a delivery of this tenant that is still pending', async () => {
    const { repo, calls } = deliveries();

    await inTenant(() => repo.setSearching('d1'));

    expect(opsOf(calls)).toEqual(['delivery.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'd1', status: 'PENDING', tenantId: TENANT },
      data: { status: 'SEARCHING' },
    });
  });
});

describe('DeliveryRepository.findCourier', () => {
  it('finds a courier of this tenant, with the user behind the account', async () => {
    const row = {
      id: 'courier-1',
      userId: 'user-9',
      status: 'ONLINE',
      verifiedAt: new Date('2026-09-01T00:00:00Z'),
      maxConcurrentOrders: 2,
    };
    const { repo, calls } = deliveries({ 'courier.findFirst': row });

    await expect(inTenant(() => repo.findCourier('courier-1'))).resolves.toBe(row);

    expect(opsOf(calls)).toEqual(['courier.findFirst']);
    expect(whereOf(calls[0])).toEqual({ id: 'courier-1', tenantId: TENANT });
    expect(calls[0]?.args['select']).toEqual({
      id: true,
      userId: true,
      status: true,
      verifiedAt: true,
      maxConcurrentOrders: true,
    });
  });

  it('finds nobody for an id from another tenant', async () => {
    const { repo } = deliveries();

    await expect(inTenant(() => repo.findCourier('courier-elsewhere'))).resolves.toBeNull();
  });
});

tenantFromTheRequest<DeliveryRepository>('DeliveryRepository', deliveries, [
  { name: 'setEta', op: 'delivery.updateMany', run: (repo) => repo.setEta('d1', null) },
  {
    name: 'setHandoverCode',
    op: 'delivery.updateMany',
    run: (repo) => repo.setHandoverCode('d1', '4821'),
  },
  { name: 'claim', op: 'delivery.updateMany', run: (repo) => repo.claim('d1', 'c1') },
  {
    name: 'transition',
    op: 'delivery.updateMany',
    run: (repo) => repo.transition('d1', 'c1', ['ASSIGNED'], 'AT_PICKUP'),
  },
  { name: 'release', op: 'delivery.updateMany', run: (repo) => repo.release('d1', 'c1') },
  { name: 'setSearching', op: 'delivery.updateMany', run: (repo) => repo.setSearching('d1') },
  { name: 'decline', op: 'deliveryOffer.updateMany', run: (repo) => repo.decline('d1', 'c1') },
  { name: 'clearOffers', op: 'deliveryOffer.deleteMany', run: (repo) => repo.clearOffers('d1') },
  { name: 'findOffer', op: 'deliveryOffer.findFirst', run: (repo) => repo.findOffer('d1', 'c1') },
  { name: 'findCourier', op: 'courier.findFirst', run: (repo) => repo.findCourier('c1') },
]);
