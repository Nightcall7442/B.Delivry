/**
 * `requireCourier` says "a courier", not "this order's courier": any courier could move any order
 * through `courier-action` and reprice any order through `actual-quantities` — which changes what
 * the customer pays. Both now belong to the courier the order is assigned to, and repricing to the
 * stretch in which the courier is at the stall weighing, with numbers a scale could show.
 */
import { effectivePermissions } from '@bazar/auth';
import { ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import {
  maxActualQuantity,
  WEIGHING_STATUSES,
} from '../../src/modules/orders/domain/order-weighing.js';
import { OrdersRepository } from '../../src/modules/orders/repository/orders.repository.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}-${Object.values(ids).join('-')}`,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...ids,
    },
  }) as never;

const ownCourier = as(['COURIER'], { courierId: 'courier-1' });
const otherCourier = as(['COURIER'], { courierId: 'courier-2' });
// A courier role with no courier profile on the token: nobody's courier.
const profilelessCourier = as(['COURIER']);

const items = [
  { id: 'i-kg', unit: 'KG', quantity: 2, unitPrice: 10_000 },
  { id: 'i-g', unit: 'G', quantity: 500, unitPrice: 20 },
  { id: 'i-pcs', unit: 'PCS', quantity: 3, unitPrice: 5_000 },
];

function service(status: OrderStatus, courierId: string | null = 'courier-1') {
  const moves: { from: OrderStatus; to: OrderStatus; actorId: string | null }[] = [];
  const applied: { orderId: string; actuals: unknown; guard: unknown }[] = [];
  const published: { name: string; payload: Record<string, unknown> }[] = [];
  let current = status;
  const order = () => ({
    id: 'o1',
    number: 'BZ-1',
    tenantId: 't1',
    customerId: 'cust-1',
    storeId: 'st1',
    addressCityId: 'city',
    paymentStatus: 'PENDING',
    currency: 'UZS',
    scheduledFor: null,
    status: current,
    courierId,
    items,
    store: { vendorId: 'vendor-stall' },
  });
  const svc = new OrdersService({
    prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
    repository: {
      async findById() {
        return order();
      },
      async applyStatus(_id: string, from: OrderStatus, to: OrderStatus, actorId: string | null) {
        moves.push({ from, to, actorId });
        current = to;
        return order();
      },
      async applyActualQuantities(orderId: string, actuals: unknown, _tx: unknown, guard: unknown) {
        applied.push({ orderId, actuals, guard });
        return { previousTotal: 40_000, total: 41_000 };
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: {
      async publish(event: { name: string; payload: Record<string, unknown> }) {
        published.push(event);
      },
    },
    autoConfirm: async () => false,
  } as never);
  return { svc, moves, applied, published };
}

describe('courier-action', () => {
  it('moves the order of the courier it is assigned to', async () => {
    const { svc, moves } = service(ORDER_STATUS.COURIER_ASSIGNED);
    await runWithContext(ownCourier, () => svc.courierAction('o1', 'arrived_pickup'));
    expect(moves).toEqual([
      expect.objectContaining({
        from: ORDER_STATUS.COURIER_ASSIGNED,
        to: ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      }),
    ]);
  });

  it('is refused to every other courier, and to a courier role with no courier profile', async () => {
    for (const who of [otherCourier, profilelessCourier]) {
      const { svc, moves } = service(ORDER_STATUS.COURIER_ASSIGNED);
      await expect(
        runWithContext(who, () => svc.courierAction('o1', 'arrived_pickup')),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(moves).toEqual([]);
    }
  });

  it('is refused on an order nobody carries', async () => {
    const { svc, moves } = service(ORDER_STATUS.SEARCHING_COURIER, null);
    await expect(
      runWithContext(ownCourier, () => svc.courierAction('o1', 'arrived_pickup')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(moves).toEqual([]);
  });

  it('does not tell a stranger what state the order is in', async () => {
    // From DELIVERED the table would answer "cannot move" — for the owner. A stranger gets a 403 first.
    const { svc } = service(ORDER_STATUS.DELIVERED);
    await expect(
      runWithContext(otherCourier, () => svc.courierAction('o1', 'arrived_pickup')),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('holds at the door every status change goes through, not only at this route', async () => {
    const { svc, moves } = service(ORDER_STATUS.COURIER_ASSIGNED);
    await expect(
      runWithContext(otherCourier, () =>
        svc.changeStatus('o1', ORDER_STATUS.COURIER_ARRIVED_PICKUP, 'courier'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(moves).toEqual([]);
  });

  it('cannot finish or fail the trip: that is the delivery’s, where the handover and the cash are booked', async () => {
    for (const [status, action] of [
      [ORDER_STATUS.COURIER_ARRIVED, 'delivered'],
      [ORDER_STATUS.PICKED_UP, 'failed'],
    ] as const) {
      const { svc, moves } = service(status);
      await expect(
        runWithContext(ownCourier, () => svc.courierAction('o1', action)),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(moves).toEqual([]);
    }
  });
});

describe('actual-quantities', () => {
  const kg = (actualQuantity: number, photoUrl?: string) => ({
    orderItemId: 'i-kg',
    actualQuantity,
    ...(photoUrl !== undefined ? { photoUrl } : {}),
  });

  it('reprices the order of the assigned courier while they are at the stall', async () => {
    for (const status of WEIGHING_STATUSES) {
      const { svc, applied, published } = service(status);
      await runWithContext(ownCourier, () =>
        svc.reprice('o1', [kg(2.1, 'https://cdn.test/s.jpg')]),
      );
      expect(applied).toEqual([
        {
          orderId: 'o1',
          actuals: [kg(2.1, 'https://cdn.test/s.jpg')],
          // The write re-asserts who and when, so a race with a status change writes nothing.
          guard: { courierId: 'courier-1', statuses: WEIGHING_STATUSES },
        },
      ]);
      expect(published.map((event) => event.name)).toEqual(['order.repriced']);
    }
  });

  it('is refused to every other courier and to a courier role with no profile', async () => {
    for (const who of [otherCourier, profilelessCourier]) {
      const { svc, applied } = service(ORDER_STATUS.PICKING_UP);
      await expect(runWithContext(who, () => svc.reprice('o1', [kg(2.1)]))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(applied).toEqual([]);
    }
  });

  it('is refused outside the stretch in which the goods are being bought', async () => {
    const outside = Object.values(ORDER_STATUS).filter((s) => !WEIGHING_STATUSES.includes(s));
    expect(outside).toContain(ORDER_STATUS.PICKED_UP);
    expect(outside).toContain(ORDER_STATUS.DELIVERED);
    for (const status of outside) {
      const { svc, applied } = service(status);
      await expect(
        runWithContext(ownCourier, () => svc.reprice('o1', [kg(2.1)])),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(applied).toEqual([]);
    }
  });

  it('takes lines of this order only', async () => {
    const { svc, applied } = service(ORDER_STATUS.PICKING_UP);
    await expect(
      runWithContext(ownCourier, () =>
        svc.reprice('o1', [{ orderItemId: 'an-item-of-another-order', actualQuantity: 1 }]),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('takes counted goods short or not at all, never more and never in halves', async () => {
    // 3 pieces ordered.
    const { svc, applied, published } = service(ORDER_STATUS.PICKING_UP);
    for (const actualQuantity of [4, 1.5, -1]) {
      await expect(
        runWithContext(ownCourier, () =>
          svc.reprice('o1', [{ orderItemId: 'i-pcs', actualQuantity }]),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    expect(applied).toEqual([]);

    await runWithContext(ownCourier, () =>
      svc.reprice('o1', [{ orderItemId: 'i-pcs', actualQuantity: 2 }]),
    );
    await runWithContext(ownCourier, () =>
      svc.reprice('o1', [{ orderItemId: 'i-pcs', actualQuantity: 0 }]),
    );
    expect(applied).toHaveLength(2);
    // Short or missing, the customer hears which line: the event names it with what was bought.
    expect(published.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        missing: [expect.objectContaining({ orderItemId: 'i-pcs', quantity: 2 })],
      }),
      expect.objectContaining({
        missing: [expect.objectContaining({ orderItemId: 'i-pcs', quantity: 0 })],
      }),
    ]);
  });

  it('does not reprice a bag with nothing left in it: that is a failed order', async () => {
    const { svc, applied } = service(ORDER_STATUS.PICKING_UP);
    await expect(
      runWithContext(ownCourier, () =>
        svc.reprice('o1', [
          { orderItemId: 'i-kg', actualQuantity: 0 },
          { orderItemId: 'i-g', actualQuantity: 0 },
          { orderItemId: 'i-pcs', actualQuantity: 0 },
        ]),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('takes the weight a scale could show, and nothing else', async () => {
    // 2 kg ordered: up to 4 kg (a whole melon is more than the slice asked for). 500 g ordered: up
    // to 1500 g (the floor lets small orders breathe).
    expect(maxActualQuantity('KG', 2)).toBe(4);
    expect(maxActualQuantity('KG', 0.2)).toBeCloseTo(1.2);
    expect(maxActualQuantity('G', 500)).toBe(1500);

    const { svc, applied, published } = service(ORDER_STATUS.PICKING_UP);
    for (const actualQuantity of [-1, Number.NaN, 4.01, 200, 10_000]) {
      await expect(
        runWithContext(ownCourier, () => svc.reprice('o1', [kg(actualQuantity)])),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    expect(applied).toEqual([]);

    await runWithContext(ownCourier, () => svc.reprice('o1', [kg(4)]));
    await runWithContext(ownCourier, () => svc.reprice('o1', [kg(0.01)]));
    // Zero is «нет у продавца»: the line leaves the bill and is named as missing; a lighter
    // weighing is the scale, not a shortage.
    await runWithContext(ownCourier, () => svc.reprice('o1', [kg(0)]));
    expect(applied).toHaveLength(3);
    expect(published.map((event) => (event.payload as { missing: unknown[] }).missing)).toEqual([
      [],
      [],
      [expect.objectContaining({ orderItemId: 'i-kg', quantity: 0 })],
    ]);
  });

  it('weighs a line once per request', async () => {
    const { svc, applied } = service(ORDER_STATUS.PICKING_UP);
    await expect(
      runWithContext(ownCourier, () => svc.reprice('o1', [kg(2), kg(1)])),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('shows the customer a web address, never a script', async () => {
    const { svc, applied } = service(ORDER_STATUS.PICKING_UP);
    for (const photoUrl of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      await expect(
        runWithContext(ownCourier, () => svc.reprice('o1', [kg(2, photoUrl)])),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    expect(applied).toEqual([]);
  });
});

describe('OrdersRepository.applyActualQuantities', () => {
  const guard = { courierId: 'courier-1', statuses: WEIGHING_STATUSES };
  const row = { id: 'o1', total: 50_000, deliveryFee: 5_000, serviceFee: 0, discount: 0, items };

  function repository(found: unknown, updated = 1) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const tx = {
      order: {
        async findFirst(args: Record<string, unknown>) {
          calls.push({ fn: 'order.findFirst', args });
          return found;
        },
        async updateMany(args: Record<string, unknown>) {
          calls.push({ fn: 'order.updateMany', args });
          return { count: updated };
        },
      },
      orderItem: {
        async update(args: Record<string, unknown>) {
          calls.push({ fn: 'orderItem.update', args });
        },
      },
    };
    return { repo: new OrdersRepository({} as never), tx, calls };
  }

  it('reads and writes the order only while it is still this courier’s, in the weighing stretch, in this tenant', async () => {
    const { repo, tx, calls } = repository(row);
    const result = await runWithContext(ownCourier, () =>
      repo.applyActualQuantities(
        'o1',
        [{ orderItemId: 'i-kg', actualQuantity: 2.5 }],
        tx as never,
        guard,
      ),
    );

    const where = {
      id: 'o1',
      tenantId: 't1',
      courierId: 'courier-1',
      status: { in: [...WEIGHING_STATUSES] },
    };
    expect(calls[0]).toMatchObject({ fn: 'order.findFirst', args: { where } });
    // 2.5 kg at 10 000 + 500 g at 20 + 3 pieces at 5 000, plus the fee: 25 000 + 10 000 + 15 000 + 5 000.
    expect(calls[1]).toMatchObject({
      fn: 'order.updateMany',
      args: { where, data: { subtotal: 50_000, total: 55_000 } },
    });
    expect(calls[2]).toMatchObject({
      fn: 'orderItem.update',
      args: { where: { id: 'i-kg' }, data: { actualQuantity: 2.5, actualTotal: 25_000 } },
    });
    expect(result).toEqual({ previousTotal: 50_000, total: 55_000 });
  });

  it('keeps what an earlier report said for the lines this one does not name', async () => {
    const earlier = {
      ...row,
      items: items.map((item) => (item.id === 'i-pcs' ? { ...item, actualQuantity: 0 } : item)),
    };
    const { repo, tx, calls } = repository(earlier);
    await runWithContext(ownCourier, () =>
      repo.applyActualQuantities(
        'o1',
        [{ orderItemId: 'i-kg', actualQuantity: 2 }],
        tx as never,
        guard,
      ),
    );
    // 2 kg at 10 000 + 500 g at 20, the pieces the stall did not have stay off: 30 000 + the fee.
    expect(calls[1]).toMatchObject({ args: { data: { subtotal: 30_000, total: 35_000 } } });
  });

  it('writes nothing when the order is no longer in that state', async () => {
    const gone = repository(null);
    await expect(
      runWithContext(ownCourier, () =>
        gone.repo.applyActualQuantities(
          'o1',
          [{ orderItemId: 'i-kg', actualQuantity: 2 }],
          gone.tx as never,
          guard,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(gone.calls.map((c) => c.fn)).toEqual(['order.findFirst']);

    // Moved between the read and the write: the guarded update matches nothing, no line is touched.
    const raced = repository(row, 0);
    await expect(
      runWithContext(ownCourier, () =>
        raced.repo.applyActualQuantities(
          'o1',
          [{ orderItemId: 'i-kg', actualQuantity: 2 }],
          raced.tx as never,
          guard,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(raced.calls.map((c) => c.fn)).toEqual(['order.findFirst', 'order.updateMany']);
  });
});
