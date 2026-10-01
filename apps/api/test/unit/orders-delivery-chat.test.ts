/**
 * Anyone who could read an order could read its chat and write into it, and everybody who was not
 * the customer or the courier was labelled STAFF — a stall vendor too. The thread is the customer's,
 * the courier's and the desk's; the stall that only gathers the goods is not in it.
 */
import { effectivePermissions } from '@bazar/auth';
import { ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
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

const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
const asOtherCustomer = as(['CUSTOMER'], { customerId: 'cust-2' });
const asCourier = as(['COURIER'], { courierId: 'courier-1' });
const asOtherCourier = as(['COURIER'], { courierId: 'courier-2' });
const asStallVendor = as(['VENDOR'], { vendorId: 'vendor-stall' });
const asOperator = as(['OPERATOR']);
const asAdmin = as(['ADMIN']);
// The owner of the stall who also orders for themselves: on their own order they are its customer.
const asOwnerCustomer = as(['VENDOR', 'CUSTOMER'], {
  vendorId: 'vendor-stall',
  customerId: 'cust-1',
});

function service(status: OrderStatus = ORDER_STATUS.COURIER_ASSIGNED) {
  const created: Record<string, unknown>[] = [];
  const asked: Record<string, unknown>[] = [];
  const published: { name: string; payload: { message: { senderRole: string } } }[] = [];
  const stored = Array.from({ length: 250 }, (_, index) => ({ id: `m${index}`, n: index }));
  const svc = new OrdersService({
    prisma: {
      chatMessage: {
        async create({ data }: { data: Record<string, unknown> }) {
          created.push(data);
          return { id: 'm-new', createdAt: new Date('2026-09-30T10:00:00Z'), ...data };
        },
        async findMany(args: { orderBy: { createdAt: 'asc' | 'desc' }; take: number }) {
          asked.push(args);
          // What the database would answer: the newest `take`, newest first.
          return stored.slice(-args.take).reverse();
        },
      },
    },
    repository: {
      async findById() {
        return {
          id: 'o1',
          number: 'BZ-1',
          tenantId: 't1',
          customerId: 'cust-1',
          storeId: 'st1',
          addressCityId: 'city',
          status,
          courierId: 'courier-1',
          store: { vendorId: 'vendor-stall' },
        };
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: {
      async publish(event: never) {
        published.push(event);
      },
    },
  } as never);
  return { svc, created, asked, published };
}

describe('the order chat', () => {
  it('is closed to the stall that only gathers the goods', async () => {
    const { svc, created } = service();
    await expect(
      runWithContext(asStallVendor, () => svc.listMessages('o1')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asStallVendor, () => svc.postMessage('o1', 'Позвоните мне')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(created).toEqual([]);
  });

  it('is closed to everyone who cannot read the order', async () => {
    for (const who of [asOtherCustomer, asOtherCourier]) {
      const { svc, created } = service();
      await expect(runWithContext(who, () => svc.listMessages('o1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(who, () => svc.postMessage('o1', 'hi'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(created).toEqual([]);
    }
  });

  it('labels each voice for what it is, in the thread and in the live push', async () => {
    const parties = [
      [asCustomer, 'CUSTOMER'],
      [asCourier, 'COURIER'],
      [asOperator, 'STAFF'],
      [asAdmin, 'STAFF'],
      [asOwnerCustomer, 'CUSTOMER'],
    ] as const;
    for (const [who, role] of parties) {
      const { svc, created, published } = service();
      await runWithContext(who, () => svc.postMessage('o1', 'Здравствуйте'));
      expect(created[0]).toMatchObject({ senderRole: role, text: 'Здравствуйте' });
      expect(published[0]?.payload.message.senderRole).toBe(role);
    }
  });

  it('is read by its three parties', async () => {
    for (const who of [asCustomer, asCourier, asOperator]) {
      const { svc } = service();
      await expect(runWithContext(who, () => svc.listMessages('o1'))).resolves.toHaveLength(200);
    }
  });

  it('shows the newest 200 messages, oldest first, so a long thread cannot hide what came last', async () => {
    const { svc, asked } = service();
    const thread = (await runWithContext(asCustomer, () => svc.listMessages('o1'))) as unknown as {
      n: number;
    }[];
    expect(asked[0]).toMatchObject({
      where: { orderId: 'o1', tenantId: 't1' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    expect(thread[0]?.n).toBe(50);
    expect(thread.at(-1)?.n).toBe(249);
  });

  it('is shut once the order is over', async () => {
    const { svc, created } = service(ORDER_STATUS.DELIVERED);
    await expect(
      runWithContext(asCustomer, () => svc.postMessage('o1', 'Спасибо')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(created).toEqual([]);
  });
});
