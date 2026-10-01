/**
 * Placing orders. A customer the desk has blocked (Customer.blockedAt) kept ordering because the
 * check lived only at login; `create(input, asCustomerId)` took the customer from its argument for
 * whoever called it; `repeat` let anyone who could read an order copy it; and `activeOnly=false`
 * arrived as true.
 */
import { effectivePermissions } from '@bazar/auth';
import { ORDER_STATUS, PAYMENT_METHOD, STORE_TYPE } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ERROR_CODE } from '../../src/common/errors/error-codes.js';
import { AppError, ConflictError, ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';
import { ordersListQuerySchema } from '../../src/modules/orders/schemas/index.js';

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
const asAdmin = as(['ADMIN']);
const asStallVendor = as(['VENDOR'], { vendorId: 'vendor-stall' });
const asCourier = as(['COURIER'], { courierId: 'courier-1' });
const asJob = systemContext('t1', 'job', 'uz');

const REACHED_THE_STORE = new Error('reached the store');

const input = {
  storeId: 'st1',
  addressId: 'addr-1',
  paymentMethod: PAYMENT_METHOD.CASH,
  items: [{ productId: 'p1', quantity: 1 }],
};

function service(customer: { blockedAt: Date | null } | null) {
  const lookups: Record<string, unknown>[] = [];
  const touched: string[] = [];
  const stall = (lat: number) => ({ type: STORE_TYPE.BAZAAR_STALL, lat, lng: 60.6 });
  const svc = new OrdersService({
    prisma: {
      customer: {
        async findFirst(args: Record<string, unknown>) {
          lookups.push(args);
          return customer;
        },
      },
    },
    repository: {
      async findById() {
        return {
          id: 'o1',
          tenantId: 't1',
          customerId: 'cust-1',
          storeId: 'st1',
          courierId: 'courier-1',
          status: ORDER_STATUS.DELIVERED,
          paymentMethod: PAYMENT_METHOD.CASH,
          store: { vendorId: 'vendor-stall' },
          items: [],
        };
      },
      async create() {
        touched.push('repository.create');
        throw new Error('an order was written');
      },
    },
    stores: {
      async getOpenStore(id: string) {
        touched.push(`getOpenStore:${id}`);
        if (id === 'unreachable') throw REACHED_THE_STORE;
        return stall(41.55);
      },
      async get() {
        touched.push('stores.get');
        throw REACHED_THE_STORE;
      },
    },
    addresses: {
      async defaultFor(customerId: string) {
        touched.push(`defaultFor:${customerId}`);
        return 'addr-default';
      },
      async getFrozen() {
        touched.push('getFrozen');
        throw REACHED_THE_STORE;
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
    autoConfirm: async () => false,
  } as never);
  return { svc, lookups, touched };
}

const blocked = { blockedAt: new Date('2026-09-01T00:00:00Z') };

describe('a blocked customer', () => {
  it('cannot place an order', async () => {
    const { svc, lookups, touched } = service(blocked);
    const refusal = await runWithContext(asCustomer, () => svc.create(input as never)).catch(
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(AppError);
    expect(refusal).toMatchObject({ code: ERROR_CODE.ACCOUNT_BLOCKED, httpStatus: 403 });
    // The check is on this tenant's row of this customer, and nothing was priced or written.
    expect(lookups[0]).toMatchObject({ where: { id: 'cust-1', tenantId: 't1' } });
    expect(touched).toEqual([]);
  });

  it('cannot ask for a quote either', async () => {
    const { svc, touched } = service(blocked);
    await expect(
      runWithContext(asCustomer, () =>
        svc.quote({ storeId: 'st1', point: { lat: 41.5, lng: 60.6 } } as never),
      ),
    ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_BLOCKED });
    expect(touched).toEqual([]);
  });

  it('cannot place a group order: no stall order is written', async () => {
    const { svc, touched } = service(blocked);
    await expect(
      runWithContext(asCustomer, () =>
        svc.createGroup({
          addressId: 'addr-1',
          paymentMethod: PAYMENT_METHOD.CASH,
          stores: [
            { storeId: 'st1', items: [{ productId: 'p1', quantity: 1 }] },
            { storeId: 'st2', items: [{ productId: 'p2', quantity: 1 }] },
          ],
        } as never),
      ),
    ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_BLOCKED });
    expect(touched).not.toContain('repository.create');
  });

  it('cannot repeat an order', async () => {
    const { svc, touched } = service(blocked);
    await expect(runWithContext(asCustomer, () => svc.repeat('o1'))).rejects.toMatchObject({
      code: ERROR_CODE.ACCOUNT_BLOCKED,
    });
    expect(touched).not.toContain('repository.create');
  });

  it('is not ordering for a subscription either: the job places nothing for them', async () => {
    const { svc, touched } = service(blocked);
    await expect(
      runWithContext(asJob as never, () => svc.create(input as never, 'cust-1')),
    ).rejects.toMatchObject({ code: ERROR_CODE.ACCOUNT_BLOCKED });
    expect(touched).toEqual([]);
  });

  it('is told apart from a customer in good standing, who goes on to the store', async () => {
    const { svc } = service({ blockedAt: null });
    await expect(
      runWithContext(asCustomer, () => svc.create({ ...input, storeId: 'unreachable' } as never)),
    ).rejects.toBe(REACHED_THE_STORE);
  });

  it('is not a customer at all when the tenant has no such row', async () => {
    const { svc } = service(null);
    await expect(
      runWithContext(asCustomer, () => svc.create(input as never)),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('whose order it is', () => {
  it('is the caller’s: a request cannot name another customer', async () => {
    for (const who of [asCustomer, asAdmin, asStallVendor, asCourier]) {
      const { svc, lookups, touched } = service({ blockedAt: null });
      await expect(
        runWithContext(who, () => svc.create(input as never, 'cust-2')),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(lookups).toEqual([]);
      expect(touched).toEqual([]);
    }
  });

  it('may be named by the subscription job, which acts as the platform', async () => {
    const { svc, lookups } = service({ blockedAt: null });
    await expect(
      runWithContext(asJob as never, () =>
        svc.create({ ...input, storeId: 'unreachable' } as never, 'cust-2'),
      ),
    ).rejects.toBe(REACHED_THE_STORE);
    expect(lookups[0]).toMatchObject({ where: { id: 'cust-2' } });
  });
});

describe('repeating an order', () => {
  it('is the customer’s own: the stall and the courier that handled it may read it, not reorder it', async () => {
    for (const who of [asStallVendor, asCourier, as(['CUSTOMER'], { customerId: 'cust-2' })]) {
      const { svc, touched } = service({ blockedAt: null });
      await expect(runWithContext(who, () => svc.repeat('o1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(touched).toEqual([]);
    }
  });

  it('works for the customer, at their own default address', async () => {
    const { svc, touched } = service({ blockedAt: null });
    await expect(runWithContext(asCustomer, () => svc.repeat('o1'))).rejects.toBe(
      REACHED_THE_STORE,
    );
    expect(touched).toContain('defaultFor:cust-1');
  });
});

describe('a group order', () => {
  it('lists each stall once: followers ride free, a stall listed twice would split its goods into a free order', async () => {
    const { svc, touched } = service({ blockedAt: null });
    const entry = (storeId: string) => ({ storeId, items: [{ productId: 'p', quantity: 1 }] });
    await expect(
      runWithContext(asCustomer, () =>
        svc.createGroup({
          addressId: 'addr-1',
          paymentMethod: PAYMENT_METHOD.CASH,
          stores: [entry('st1'), entry('st2'), entry('st1')],
        } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(touched).toEqual([]);
  });
});

describe('the orders list query', () => {
  it('reads activeOnly as a word: "false" is false, not true', () => {
    expect(ordersListQuerySchema.parse({ activeOnly: 'false' }).activeOnly).toBe(false);
    expect(ordersListQuerySchema.parse({ activeOnly: '0' }).activeOnly).toBe(false);
    expect(ordersListQuerySchema.parse({ activeOnly: 'true' }).activeOnly).toBe(true);
    expect(ordersListQuerySchema.parse({}).activeOnly).toBeUndefined();
  });

  it('refuses a value it cannot read rather than guessing', () => {
    expect(ordersListQuerySchema.safeParse({ activeOnly: 'maybe' }).success).toBe(false);
  });
});
