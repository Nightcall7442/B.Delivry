/**
 * What the review of the queue fix found once the schedules and searches really run in production:
 * a subscription whose window was missed must not be placed late once per missed week; the retries
 * of a second search for one order must not collide with the first search's; and recovery must not
 * start a group follower searching on its own.
 */
import { describe, expect, it } from 'vitest';
import type { Container } from '../../src/app/container.js';
import { requeueStalledSearches } from '../../src/jobs/recover.js';
import { findCourierJob } from '../../src/jobs/workers/find-courier.job.js';
import { SubscriptionsService } from '../../src/modules/subscriptions/service/subscriptions.service.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';

describe('subscriptions: missed windows', () => {
  const NOW = new Date('2026-09-29T05:00:00Z'); // Tue 10:00 Tashkent
  const row = (nextRunAt: Date) => ({
    id: 's1',
    tenantId: 't1',
    customerId: 'c1',
    storeId: 'st1',
    addressId: 'a1',
    paymentMethod: 'CASH',
    weekday: 6, // Saturday
    hour: 8,
    nextRunAt,
    items: [{ productId: 'p1', quantity: 1 }],
  });

  function service(rows: ReturnType<typeof row>[]) {
    const placed: { scheduledFor: Date }[] = [];
    const marked: { nextRunAt: Date; lastError: string | null }[] = [];
    const svc = new SubscriptionsService({
      repository: {
        async due() {
          return rows;
        },
        async markRun(_id: string, result: { nextRunAt: Date; lastError: string | null }) {
          marked.push(result);
        },
      },
      orders: {
        async create(input: { scheduledFor: Date }) {
          placed.push(input);
          return { id: 'o1' };
        },
      },
      catalog: {
        async getPurchasable() {
          return new Map([['p1', {}]]);
        },
      },
      stores: {},
      addresses: {},
      notifications: { async send() {} },
      logger: { error() {}, warn() {}, info() {}, debug() {} },
      events: { async publish() {} },
    } as never);
    return { svc, placed, marked };
  }

  const asSystem = () => systemContext('t1', 'job', 'ru');

  it('places an order whose window opens within the lead time', async () => {
    const opens = new Date(NOW.getTime() + 60 * 60_000);
    const { svc, placed, marked } = service([row(opens)]);
    expect(await runWithContext(asSystem(), () => svc.runDue(NOW))).toBe(1);
    expect(placed).toEqual([expect.objectContaining({ scheduledFor: opens })]);
    expect(marked[0]?.lastError).toBeNull();
  });

  it('skips a window that passed while nothing was running, and moves on to the next one', async () => {
    const stale = new Date('2026-09-12T03:00:00Z'); // 17 days ago
    const { svc, placed, marked } = service([row(stale)]);
    expect(await runWithContext(asSystem(), () => svc.runDue(NOW))).toBe(0);

    expect(placed).toEqual([]);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.lastError).toMatch(/missed/i);
    // The next run is the coming Saturday 08:00 Tashkent, not another stale week.
    expect(marked[0]?.nextRunAt.toISOString()).toBe('2026-10-03T03:00:00.000Z');
  });

  it('still places a window that is only a few minutes late', async () => {
    const late = new Date(NOW.getTime() - 10 * 60_000);
    const { svc, placed } = service([row(late)]);
    expect(await runWithContext(asSystem(), () => svc.runDue(NOW))).toBe(1);
    expect(placed).toHaveLength(1);
  });
});

describe('find-courier retries', () => {
  function chain(run: string | undefined) {
    const enqueued: { jobId?: string }[] = [];
    const container = {
      services: {
        orders: {
          async get() {
            return { status: 'CONFIRMED' };
          },
        },
        delivery: {
          async createForOrder() {},
          async runSearch() {
            return [];
          },
          nextRadius: (radius: number) => radius + 2000,
        },
      },
      queue: {
        async enqueue(
          _queue: string,
          _name: string,
          _payload: unknown,
          options: { jobId?: string },
        ) {
          enqueued.push(options);
        },
      },
      logger: { info() {}, debug() {}, warn() {}, error() {} },
    } as unknown as Container;
    return {
      enqueued,
      run: () =>
        findCourierJob(container)({
          tenantId: 't1',
          orderId: 'o1',
          radiusMeters: 2000,
          attempt: 1,
          ...(run !== undefined ? { run } : {}),
        }),
    };
  }

  it('gives two search runs for one order different retry ids', async () => {
    const first = chain(undefined);
    const second = chain('event-7');
    await first.run();
    await second.run();
    expect(first.enqueued[0]?.jobId).toBe('find-courier:o1:first:2');
    expect(second.enqueued[0]?.jobId).toBe('find-courier:o1:event-7:2');
    expect(first.enqueued[0]?.jobId).not.toBe(second.enqueued[0]?.jobId);
  });
});

describe('recovery: group followers', () => {
  const stuck = (id: string, groupId: string | null) => ({
    id,
    tenantId: 't1',
    scheduledFor: null,
    groupId,
  });

  function recovery(
    candidates: ReturnType<typeof stuck>[],
    group: { id: string; status: string }[],
  ) {
    const enqueued: { payload: { orderId: string } }[] = [];
    const container = {
      prisma: {
        order: {
          async findMany(args: { where: { groupId?: string } }) {
            return args.where.groupId === undefined ? candidates : group.slice(0, 1);
          },
        },
      },
      queue: {
        async enqueue(_q: string, _n: string, payload: { orderId: string }) {
          enqueued.push({ payload });
        },
      },
      logger: { warn() {}, info() {}, error() {}, debug() {} },
    } as unknown as Container;
    return { container, enqueued };
  }

  it('leaves a follower to its leader’s courier', async () => {
    const { container, enqueued } = recovery(
      [stuck('follower', 'g1')],
      [
        { id: 'leader', status: 'SEARCHING_COURIER' },
        { id: 'follower', status: 'CONFIRMED' },
      ],
    );
    expect(await requeueStalledSearches(container)).toBe(0);
    expect(enqueued).toEqual([]);
  });

  it('searches for the leader itself, and for an order whose leader is already finished', async () => {
    const asLeader = recovery([stuck('leader', 'g1')], [{ id: 'leader', status: 'CONFIRMED' }]);
    expect(await requeueStalledSearches(asLeader.container)).toBe(1);

    const orphan = recovery([stuck('follower', 'g1')], [{ id: 'leader', status: 'DELIVERED' }]);
    expect(await requeueStalledSearches(orphan.container)).toBe(1);
  });

  it('searches for an ordinary order', async () => {
    const { container, enqueued } = recovery([stuck('o1', null)], []);
    expect(await requeueStalledSearches(container)).toBe(1);
    expect(enqueued[0]?.payload.orderId).toBe('o1');
  });
});
