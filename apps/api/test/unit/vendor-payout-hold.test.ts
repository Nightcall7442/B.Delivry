/**
 * Bazara's money-back guarantee on the vendor's side: an order's money is the vendor's to take
 * only once the customer can no longer complain about it — the freshness window after delivery has
 * passed and no complaint about the order is open (a courier ticket does not hold the stall's
 * money). Until then it is owed but on hold, and the vendor sees when the next of it clears.
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

function world(sums: { all: number; held: number; heldCount: number }, firstHeld: Date | null) {
  const aggregates: Record<string, unknown>[] = [];
  const finds: Record<string, unknown>[] = [];
  const prisma = {
    order: {
      async aggregate(args: { where: Record<string, unknown> }) {
        aggregates.push(args.where);
        const held = 'OR' in args.where;
        return {
          _sum: { subtotal: held ? sums.held : sums.all },
          _count: held ? sums.heldCount : 5,
        };
      },
      async findFirst(args: { where: Record<string, unknown> }) {
        finds.push(args.where);
        return firstHeld === null ? null : { deliveredAt: firstHeld };
      },
    },
    vendor: {
      async findUnique() {
        return { commissionPercent: 10 };
      },
    },
  };
  const repository = new VendorsRepository(prisma as never);
  const payout = () =>
    runWithContext(systemContext('t1', 'r1', 'ru'), () =>
      repository.pendingPayout('vendor-1', undefined, NOW),
    );
  return { payout, aggregates, finds };
}

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
