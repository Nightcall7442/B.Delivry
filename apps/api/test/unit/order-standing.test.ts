/**
 * `order:update` is held by every vendor, and the routes that confirm or move an order asked for
 * nothing more — so a vendor could confirm, move or cancel the order of ANY stall. Whose order it
 * is now decides who may act, and the vendor of the stall may decline an order early.
 */
import { effectivePermissions } from '@bazar/auth';
import { ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidStateTransitionError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';

const STALL_VENDOR = 'vendor-stall';

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}`,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...ids,
    },
  }) as never;

const asAdmin = as(['ADMIN']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
const asOtherCustomer = as(['CUSTOMER'], { customerId: 'cust-2' });
const asStallVendor = as(['VENDOR'], { vendorId: STALL_VENDOR });
const asOtherVendor = as(['VENDOR'], { vendorId: 'vendor-other' });

function service(status: OrderStatus) {
  const moves: { from: OrderStatus; to: OrderStatus; actorId: string | null }[] = [];
  const published: string[] = [];
  let current = status;
  const order = () => ({
    id: 'o1',
    number: 'BZ-1',
    tenantId: 't1',
    customerId: 'cust-1',
    storeId: 'st1',
    addressCityId: 'city',
    paymentStatus: 'PENDING',
    scheduledFor: null,
    status: current,
    store: { vendorId: STALL_VENDOR },
  });
  const svc = new OrdersService({
    prisma: {
      customer: {
        async findUnique() {
          return { plusUntil: null };
        },
      },
    },
    repository: {
      async findById() {
        return order();
      },
      async applyStatus(_id: string, from: OrderStatus, to: OrderStatus, actorId: string | null) {
        moves.push({ from, to, actorId });
        current = to;
        return order();
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: {
      async publish(event: { name: string }) {
        published.push(event.name);
      },
    },
    autoConfirm: async () => false,
  } as never);
  return { svc, moves, published };
}

describe('confirming an order', () => {
  it('is the vendor’s of that stall, and the desk’s', async () => {
    for (const who of [asStallVendor, asAdmin]) {
      const { svc, moves } = service(ORDER_STATUS.PENDING);
      await runWithContext(who, () => svc.confirm('o1'));
      expect(moves).toEqual([
        expect.objectContaining({ from: ORDER_STATUS.PENDING, to: ORDER_STATUS.CONFIRMED }),
      ]);
    }
  });

  it('is refused to another stall’s vendor, and to the customer', async () => {
    for (const who of [asOtherVendor, asCustomer]) {
      const { svc, moves } = service(ORDER_STATUS.PENDING);
      await expect(runWithContext(who, () => svc.confirm('o1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(moves).toEqual([]);
    }
  });
});

describe('declining an order', () => {
  it('may be done by the vendor of that stall while the goods are still the stall’s', async () => {
    for (const status of [
      ORDER_STATUS.PENDING,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.SEARCHING_COURIER,
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
    ]) {
      const { svc, moves, published } = service(status);
      await runWithContext(asStallVendor, () => svc.cancel('o1', 'Нет товара'));
      expect(moves[0]?.to).toBe(ORDER_STATUS.CANCELLED);
      expect(published).toContain('order.cancelled');
    }
  });

  it('is over once the courier has the goods', async () => {
    const { svc, moves } = service(ORDER_STATUS.PICKED_UP);
    await expect(
      runWithContext(asStallVendor, () => svc.cancel('o1', 'Передумали')),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(moves).toEqual([]);
  });

  it('is refused to another stall’s vendor and to a stranger', async () => {
    for (const who of [asOtherVendor, asOtherCustomer]) {
      const { svc, moves } = service(ORDER_STATUS.PENDING);
      await expect(runWithContext(who, () => svc.cancel('o1', 'x'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(moves).toEqual([]);
    }
  });

  it('still works for the customer of the order, and for the desk on anyone’s', async () => {
    for (const who of [asCustomer, asAdmin]) {
      const { svc, moves } = service(ORDER_STATUS.CONFIRMED);
      await runWithContext(who, () => svc.cancel('o1', 'Передумал'));
      expect(moves[0]?.to).toBe(ORDER_STATUS.CANCELLED);
    }
  });
});

describe('the status override', () => {
  it('is the desk’s alone: a vendor, even of that stall, cannot force a status', async () => {
    const { svc, moves } = service(ORDER_STATUS.CONFIRMED);
    await expect(
      runWithContext(asStallVendor, () =>
        svc.changeStatusAsStaff('o1', ORDER_STATUS.SEARCHING_COURIER),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(moves).toEqual([]);

    await runWithContext(asAdmin, () =>
      svc.changeStatusAsStaff('o1', ORDER_STATUS.SEARCHING_COURIER),
    );
    expect(moves).toHaveLength(1);
  });
});
