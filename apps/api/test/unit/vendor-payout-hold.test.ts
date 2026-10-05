/**
 * Bazara's money-back guarantee on the vendor's side: an order's money is the vendor's to take
 * only once the customer can no longer complain about it — the freshness window after delivery has
 * passed and no complaint about the order is open (a courier ticket does not hold the stall's
 * money). Until then it is owed but on hold, and the vendor sees when the next of it clears.
 * Both are after the cut, taken at the rate each order was placed at (orders-commission).
 *
 * Real VendorsRepository; Prisma is a fake that records the WHERE it is sent and answers sums.
 */
import { GUARANTEE } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { VendorsRepository } from '../../src/modules/vendors/repository/vendors.repository.js';

const NOW = new Date('2026-10-05T12:00:00Z');
const WINDOW_MS = GUARANTEE.FRESHNESS_WINDOW_HOURS * 3_600_000;
const CUTOFF = new Date(NOW.getTime() - WINDOW_MS);

interface Rate {
  /** The rate the orders were placed at. */
  percent: number;
  subtotal: number;
  orders: number;
}
const rate = (percent: number, subtotal: number, orders: number): Rate => ({
  percent,
  subtotal,
  orders,
});

/** Delivered orders as the database sums them: one row per rate, all of them and the held. */
function byRate(all: Rate[], held: Rate[], firstHeld: Date | null) {
  const groups: Record<string, unknown>[] = [];
  const finds: Record<string, unknown>[] = [];
  const rows = (rates: Rate[]) =>
    rates.map((r) => ({
      commissionPercent: r.percent,
      _sum: { subtotal: r.subtotal },
      _count: { _all: r.orders },
    }));
  const prisma = {
    order: {
      async groupBy(args: { by: string[]; where: Record<string, unknown> }) {
        expect(args.by).toEqual(['commissionPercent']);
        groups.push(args.where);
        return rows('OR' in args.where ? held : all);
      },
      async findFirst(args: { where: Record<string, unknown> }) {
        finds.push(args.where);
        return firstHeld === null ? null : { deliveredAt: firstHeld };
      },
    },
  };
  const repository = new VendorsRepository(prisma as never);
  const payout = () =>
    runWithContext(systemContext('t1', 'r1', 'ru'), () =>
      repository.pendingPayout('vendor-1', undefined, NOW),
    );
  return { payout, aggregates: groups, finds };
}

/** Every order at one 10 % rate: five delivered, some of them held. */
const world = (sums: { all: number; held: number; heldCount: number }, firstHeld: Date | null) =>
  byRate(
    [rate(10, sums.all, 5)],
    sums.heldCount > 0 || sums.held > 0 ? [rate(10, sums.held, sums.heldCount)] : [],
    firstHeld,
  );

describe('the vendor payout, held until the complaint window closes', () => {
  it('splits what is owed into what may be paid out and what is on hold, both after commission', async () => {
    const { payout } = world({ all: 1_000_000, held: 300_000, heldCount: 2 }, null);
    expect(await payout()).toMatchObject({
      pending: 900_000,
      onHold: 270_000,
      available: 630_000,
      onHoldOrders: 2,
      orderCount: 5,
    });
  });

  it('holds what was delivered inside the window, or has an open complaint about the goods', async () => {
    const { payout, aggregates } = world({ all: 0, held: 0, heldCount: 0 }, null);
    await payout();
    expect(aggregates[0]).toMatchObject({
      tenantId: 't1',
      status: 'DELIVERED',
      store: { vendorId: 'vendor-1' },
    });
    expect(aggregates[1]).toMatchObject({
      tenantId: 't1',
      status: 'DELIVERED',
      OR: [
        { deliveredAt: { gt: CUTOFF } },
        {
          tickets: {
            some: {
              status: { in: ['OPEN', 'PENDING'] },
              topic: { in: ['ORDER_ISSUE', 'PRODUCT_QUALITY'] },
            },
          },
        },
      ],
    });
  });

  it('says when the first order held by the clock clears', async () => {
    const delivered = new Date(NOW.getTime() - 30 * 60_000);
    const { payout, finds } = world({ all: 100, held: 100, heldCount: 1 }, delivered);
    expect((await payout()).releasesAt).toBe(
      new Date(delivered.getTime() + WINDOW_MS).toISOString(),
    );
    // A complaint has no clock of its own: those orders are not the next to clear.
    expect(finds[0]).toHaveProperty('NOT');
  });

  it('has nothing to release when nothing waits on the clock', async () => {
    const { payout } = world({ all: 100, held: 0, heldCount: 0 }, null);
    expect(await payout()).toMatchObject({ releasesAt: null, onHold: 0, available: 90 });
  });
});

describe('the cut, at the rate each order was placed at', () => {
  it('takes the tariff’s cut where the vendor has no rate of its own, and its own where it has', async () => {
    // 1 000 000 placed on the 10 % tariff, 400 000 after the desk agreed 5 % with this stall,
    // and 200 000 from a promotion at 0 %. Before, all of it was paid out at the vendor's rate
    // or, with none, whole.
    const { payout } = byRate(
      [rate(10, 1_000_000, 3), rate(5, 400_000, 2), rate(0, 200_000, 1)],
      [rate(5, 100_000, 1)],
      null,
    );
    expect(await payout()).toMatchObject({
      pending: 900_000 + 380_000 + 200_000,
      onHold: 95_000,
      available: 900_000 + 380_000 + 200_000 - 95_000,
      orderCount: 6,
      onHoldOrders: 1,
    });
  });

  it('owes nothing when nothing was delivered', async () => {
    const { payout } = byRate([], [], null);
    expect(await payout()).toMatchObject({ pending: 0, available: 0, onHold: 0, orderCount: 0 });
  });
});
