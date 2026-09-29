/**
 * Production ran BullMQ with nobody consuming it, and every courier search id was refused for its
 * colon: an order confirmed in the desk sat in CONFIRMED with no delivery, and no courier ever
 * heard of it. These pin the two halves of the repair.
 */
import { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import type { Container } from '../../src/app/container.js';
import { bullJobId } from '../../src/infrastructure/redis/queue.js';
import { requeueStalledSearches } from '../../src/jobs/recover.js';

/** BullMQ's own rule for a custom job id, as the library applies it before queueing. */
const acceptedByBullMq = (jobId: string): boolean => {
  try {
    (Job.prototype as unknown as { validateOptions(data: unknown): void }).validateOptions.call(
      { opts: { jobId } },
      {},
    );
    return true;
  } catch {
    return false;
  }
};

describe('job ids', () => {
  const ids = [
    'find-courier:order-1',
    'find-courier:order-1:event-2',
    'find-courier:order-1:3',
    'repeat:expire-cashback',
    'notify:late-refund:order-1',
    'arrivals:store-1:2026-09-29:customer-1',
  ];

  it('are what BullMQ refuses as written, so the library rule is really being tested', () => {
    expect(acceptedByBullMq('find-courier:order-1')).toBe(false);
    expect(acceptedByBullMq('arrivals:store-1:2026-09-29:customer-1')).toBe(false);
  });

  it('are all accepted once made safe, and stay distinct', () => {
    for (const id of ids) expect(acceptedByBullMq(bullJobId(id))).toBe(true);
    expect(new Set(ids.map(bullJobId)).size).toBe(ids.length);
  });
});

function recovery(orders: { id: string; tenantId: string; scheduledFor: Date | null }[]) {
  const asked: unknown[] = [];
  const enqueued: { queue: string; name: string; payload: unknown; options: unknown }[] = [];
  const container = {
    prisma: {
      order: {
        async findMany(args: unknown) {
          asked.push(args);
          return orders;
        },
      },
    },
    queue: {
      async enqueue(queue: string, name: string, payload: unknown, options: unknown) {
        enqueued.push({ queue, name, payload, options });
      },
    },
    logger: { warn() {}, info() {}, error() {}, debug() {} },
  } as unknown as Container;
  return { container, asked, enqueued };
}

describe('requeueStalledSearches', () => {
  it('asks for recent confirmed orders that have no delivery', async () => {
    const { container, asked } = recovery([]);
    await requeueStalledSearches(container);
    const where = (asked[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ status: 'CONFIRMED', delivery: null });
    expect(where.confirmedAt).toHaveProperty('gte');
  });

  it('queues the search from the first radius under the confirm handler’s own job id', async () => {
    const { container, enqueued } = recovery([{ id: 'o1', tenantId: 't1', scheduledFor: null }]);
    expect(await requeueStalledSearches(container)).toBe(1);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      queue: 'delivery',
      name: 'find-courier',
      payload: { orderId: 'o1', tenantId: 't1', attempt: 1, radiusMeters: 2000 },
      options: { jobId: 'find-courier:o1' },
    });
  });

  it('holds a slot order until shortly before its window', async () => {
    const opensIn = 3 * 3600_000;
    const { container, enqueued } = recovery([
      { id: 'o2', tenantId: 't1', scheduledFor: new Date(Date.now() + opensIn) },
    ]);
    await requeueStalledSearches(container);
    const delay = (enqueued[0]!.options as { delayMs?: number }).delayMs ?? 0;
    expect(delay).toBeGreaterThan(opensIn - 46 * 60_000);
    expect(delay).toBeLessThanOrEqual(opensIn - 44 * 60_000);
  });

  it('does nothing when no order is stuck', async () => {
    const { container, enqueued } = recovery([]);
    expect(await requeueStalledSearches(container)).toBe(0);
    expect(enqueued).toHaveLength(0);
  });
});
