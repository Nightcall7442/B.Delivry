/**
 * GET /tracking/history asked only for `delivery:read`, which every courier holds: any courier could
 * read any courier's or any order's GPS trace (where a person went, door to door), and the table has
 * no tenant column, so a desk could read another tenant's traces by id. A trace now follows whose it
 * is: the desk reads its tenant's, a courier its own, an order's only whoever may read that order,
 * and the stall none (the trace ends at the customer's door).
 *
 * Real roles, real can(), real standingOn(); the orders service and the database are fakes.
 */
import { can, effectivePermissions } from '@bazar/auth';
import { PERMISSION, ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { requireContext, runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { TrackingRepository } from '../../src/modules/tracking/repository/tracking.repository.js';
import { TrackingService } from '../../src/modules/tracking/service/tracking.service.js';

const TENANT = 't1';

const as = (roles: Role[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext(TENANT, 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}-${Object.values(ids).join('-')}`,
      tenantId: TENANT,
      roles,
      permissions: effectivePermissions(roles),
      sessionId: 's1',
      locale: 'ru',
      ...ids,
    },
  }) as never;

const courierA = as([ROLE.COURIER], { courierId: 'courier-a' });
const courierB = as([ROLE.COURIER], { courierId: 'courier-b' });
const customer = as([ROLE.CUSTOMER], { customerId: 'cust-1' });
const stallVendor = as([ROLE.VENDOR], { vendorId: 'vendor-stall' });
/** A vendor who also holds a courier profile, so `delivery:read` does not stop them at the door. */
const stallVendorWhoCouriers = as([ROLE.VENDOR, ROLE.COURIER], {
  vendorId: 'vendor-stall',
  courierId: 'courier-v',
});
const desk = as([ROLE.OPERATOR]);
const admin = as([ROLE.ADMIN]);

/** Carried by courier-a, placed by cust-1 with the stall of vendor-stall. */
const ORDER = {
  id: 'o1',
  tenantId: TENANT,
  status: 'IN_DELIVERY',
  customerId: 'cust-1',
  courierId: 'courier-a',
  store: { vendorId: 'vendor-stall' },
};

function build() {
  const historyCalls: unknown[] = [];
  const service = new TrackingService({
    repository: {
      async history(filters: unknown) {
        historyCalls.push(filters);
        return [];
      },
    },
    orders: {
      // What the real OrdersService.get enforces: the order's own parties and the desk.
      async get(orderId: string) {
        if (orderId !== ORDER.id) throw new NotFoundError('Order', orderId);
        const user = requireContext().user!;
        const allowed = can(user, PERMISSION.ORDER_READ, {
          tenantId: ORDER.tenantId,
          customerId: ORDER.customerId,
          vendorId: ORDER.store.vendorId,
          courierId: ORDER.courierId,
        });
        if (!allowed) throw new ForbiddenError('Missing permission: order:read');
        return ORDER;
      },
    },
    delivery: {},
    eta: {},
    realtime: {},
    logger: { error() {}, warn() {}, info() {}, debug() {} },
  } as never);
  return { service, historyCalls };
}

describe('tracking history: whose trace may be read', () => {
  it('refuses a courier the trace of another courier', async () => {
    const { service, historyCalls } = build();
    await expect(
      runWithContext(courierA, () => service.history({ courierId: 'courier-b' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(historyCalls).toHaveLength(0);
  });

  it('lets a courier read their own trace', async () => {
    const { service, historyCalls } = build();
    await runWithContext(courierA, () => service.history({ courierId: 'courier-a' }));
    expect(historyCalls).toEqual([{ courierId: 'courier-a' }]);
  });

  it('refuses a courier the trace of an order they do not carry', async () => {
    const { service, historyCalls } = build();
    await expect(
      runWithContext(courierB, () => service.history({ orderId: 'o1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(historyCalls).toHaveLength(0);
  });

  it('answers an unknown order with 404, not an empty trace', async () => {
    const { service } = build();
    await expect(
      runWithContext(courierA, () => service.history({ orderId: 'nope' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('shows the carrying courier only their own trace of the order, whatever they ask for', async () => {
    const { service, historyCalls } = build();
    await runWithContext(courierA, () =>
      service.history({ orderId: 'o1', courierId: 'courier-previous' }),
    );
    expect(historyCalls).toEqual([{ orderId: 'o1', courierId: 'courier-a' }]);
  });

  it('gives the desk the trace of any courier and of any order of its tenant', async () => {
    for (const who of [desk, admin]) {
      const { service, historyCalls } = build();
      await runWithContext(who, () => service.history({ courierId: 'courier-b' }));
      await runWithContext(who, () => service.history({ orderId: 'o1' }));
      expect(historyCalls).toEqual([{ courierId: 'courier-b' }, { orderId: 'o1' }]);
    }
  });

  it('keeps the customer-side trace from the stall, even a vendor who also has a courier profile', async () => {
    const { service, historyCalls } = build();
    await expect(
      runWithContext(stallVendorWhoCouriers, () => service.history({ orderId: 'o1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // And not their own courier trace by way of the order either: the order is not theirs to carry.
    await expect(
      runWithContext(stallVendorWhoCouriers, () => service.history({ courierId: 'courier-a' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(historyCalls).toHaveLength(0);
  });

  it('refuses the roles that never had delivery:read', async () => {
    for (const who of [customer, stallVendor]) {
      const { service } = build();
      await expect(
        runWithContext(who, () => service.history({ orderId: 'o1' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('wants an order or a courier to look at', async () => {
    const { service } = build();
    await expect(runWithContext(desk, () => service.history({}))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('tracking history: the table has no tenant, so the query brings one', () => {
  it('only reads traces of couriers of the caller tenant', async () => {
    const calls: { where: Record<string, unknown> }[] = [];
    const repository = new TrackingRepository({
      courierLocation: {
        async findMany(args: { where: Record<string, unknown> }) {
          calls.push(args);
          return [];
        },
      },
    } as never);

    await runWithContext(desk, () => repository.history({ courierId: 'courier-b', limit: 10 }));
    await runWithContext(desk, () => repository.history({ orderId: 'o1' }));

    expect(calls.map((call) => call.where.courier)).toEqual([
      { tenantId: TENANT },
      { tenantId: TENANT },
    ]);
  });
});

describe('the live map', () => {
  const callable = (roles: Role[]) => {
    const service = new TrackingService({
      repository: {
        async liveCouriers() {
          return [];
        },
      },
      orders: {},
      delivery: {},
      eta: {},
      realtime: {},
      logger: { error() {}, warn() {}, info() {}, debug() {} },
    } as never);
    return runWithContext(as(roles, { courierId: 'c', customerId: 'k', vendorId: 'v' }), () =>
      service.liveMap('city-1'),
    ).then(
      () => true,
      () => false,
    );
  };

  it('is the desk alone: no courier, customer or vendor sees every courier of a city', async () => {
    const allowed: Role[] = [];
    for (const role of Object.values(ROLE)) if (await callable([role])) allowed.push(role);
    expect(allowed.sort()).toEqual([ROLE.ADMIN, ROLE.OPERATOR, ROLE.SUPER_ADMIN].sort());
  });

  it('only lists couriers of the caller tenant, whatever city id is named', async () => {
    const calls: { where: Record<string, unknown> }[] = [];
    const repository = new TrackingRepository({
      courier: {
        async findMany(args: { where: Record<string, unknown> }) {
          calls.push(args);
          return [];
        },
      },
    } as never);

    await runWithContext(desk, () => repository.liveCouriers('city-of-someone-else', new Date(0)));

    expect(calls[0]?.where).toMatchObject({ tenantId: TENANT, cityId: 'city-of-someone-else' });
  });
});
