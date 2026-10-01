/**
 * Couriers. Applying as a neighbour created the COURIER role on the spot, so an applicant held courier
 * rights before anyone had looked at them; the role now comes with the desk's verify(). A courier could
 * raise their own maxConcurrentOrders, the desk's verify/suspend were not tenant-scoped, a suspended
 * courier could still be written back ONLINE by a request that read the profile a moment earlier, and
 * `?onlineOnly=false` meant true.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { CouriersRepository } from '../../src/modules/couriers/repository/couriers.repository.js';
import { couriersListQuerySchema } from '../../src/modules/couriers/schemas/index.js';
import { CouriersService } from '../../src/modules/couriers/service/couriers.service.js';

const as = (roles: string[], ids: Record<string, string> = {}, userId?: string) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: userId ?? `user-${roles.join('-')}`,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...ids,
    },
  }) as never;

const asAdmin = as(['ADMIN']);
const asOperator = as(['OPERATOR']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' }, 'user-applicant');
const asCourier = as(['COURIER'], { courierId: 'c1' }, 'user-courier');
const asCourierWithoutProfile = as(['COURIER'], {}, 'user-courier-2');

function courierRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    tenantId: 't1',
    userId: 'user-courier',
    cityId: 'city-1',
    status: 'OFFLINE',
    verifiedAt: new Date('2026-01-01'),
    maxConcurrentOrders: 1,
    currency: 'UZS',
    updatedAt: new Date('2026-01-02'),
    ...extra,
  };
}

function service(
  options: {
    courier?: Record<string, unknown> | null;
    rolesOfUser?: string[];
    ownStatusAccepted?: boolean;
    created?: Error;
  } = {},
) {
  const calls = {
    update: [] as unknown[],
    verify: [] as unknown[],
    setStatus: [] as unknown[],
    setOwnStatus: [] as unknown[],
    logoutAll: [] as string[],
    createNeighbour: [] as unknown[],
  };
  const row = options.courier === undefined ? courierRow() : options.courier;
  /** Set once createNeighbour has run: the unique index fired because the first tap's row exists. */
  let raced = false;
  const svc = new CouriersService({
    repository: {
      async findById(id: string) {
        return row !== null && id === row.id ? row : null;
      },
      async findByUserId() {
        return raced ? courierRow({ id: 'made' }) : null;
      },
      async update(id: string, data: unknown) {
        calls.update.push([id, data]);
        return { ...courierRow(), ...(data as object) };
      },
      async verify(...args: unknown[]) {
        calls.verify.push(args);
        return courierRow({ verifiedAt: args[2] });
      },
      async setStatus(id: string, status: string) {
        calls.setStatus.push([id, status]);
      },
      async setOwnStatus(id: string, status: string) {
        calls.setOwnStatus.push([id, status]);
        return options.ownStatusAccepted ?? true;
      },
      async countOnline() {
        return 0;
      },
      async rolesOfUser() {
        return options.rolesOfUser ?? ['COURIER'];
      },
      async createNeighbour(input: unknown) {
        calls.createNeighbour.push(input);
        if (options.created !== undefined) {
          raced = true;
          throw options.created;
        }
        return courierRow({ id: 'made' });
      },
    },
    delivery: {
      async activeForCourier() {
        return [];
      },
    },
    payments: {
      async balance() {
        return { balance: 0 };
      },
    },
    auth: {
      async logoutAll(userId: string) {
        calls.logoutAll.push(userId);
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, calls };
}

describe('applying as a neighbour courier', () => {
  /** The real repository over a fake database that records every write. */
  function database(customer: { blockedAt: Date | null } | null = { blockedAt: null }) {
    const writes = { roles: [] as unknown[], couriers: [] as Record<string, unknown>[] };
    const lookups = { address: [] as unknown[], customer: [] as unknown[] };
    const prisma = {
      customer: {
        async findFirst(args: unknown) {
          lookups.customer.push(args);
          return customer;
        },
      },
      address: {
        async findFirst(args: unknown) {
          lookups.address.push(args);
          return { cityId: 'city-1', lat: 41.55, lng: 60.63 };
        },
      },
      userRole: {
        async upsert(args: unknown) {
          writes.roles.push(args);
        },
      },
      courier: {
        async create(args: { data: Record<string, unknown> }) {
          writes.couriers.push(args.data);
          return { id: 'made', ...args.data };
        },
      },
    };
    return { repository: new CouriersRepository(prisma as never), writes, lookups };
  }

  const input = {
    userId: 'user-applicant',
    customerId: 'cust-1',
    addressId: 'addr-1',
    radiusMeters: 1500,
  };

  it('creates the profile and grants no role: the role is the desk’s, at verify()', async () => {
    const { repository, writes } = database();
    await runWithContext(asCustomer, () => repository.createNeighbour(input));
    expect(writes.couriers).toHaveLength(1);
    expect(writes.couriers[0]).toMatchObject({
      neighbour: true,
      tenantId: 't1',
      userId: 'user-applicant',
    });
    // Not verified, either: the profile waits for a person.
    expect(writes.couriers[0]).not.toHaveProperty('verifiedAt');
    expect(writes.roles).toEqual([]);
  });

  it('looks the address up inside the tenant and among the live ones', async () => {
    const { repository, lookups } = database();
    await runWithContext(asCustomer, () => repository.createNeighbour(input));
    expect(lookups.address[0]).toMatchObject({
      where: { id: 'addr-1', customerId: 'cust-1', tenantId: 't1', deletedAt: null },
    });
  });

  it('refuses a customer the desk has blocked since the token was issued', async () => {
    const { repository, writes } = database({ blockedAt: new Date() });
    await expect(
      runWithContext(asCustomer, () => repository.createNeighbour(input)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(writes.couriers).toEqual([]);
  });

  it('answers a double tap with the profile the first tap made', async () => {
    const { svc, calls } = service({
      created: Object.assign(new Error('unique'), { code: 'P2002' }),
    });
    // The lookup before the create finds nothing, then the unique index fires and the row is there.
    const result = await runWithContext(asCustomer, () => svc.applyNeighbour('addr-1'));
    expect(result).toMatchObject({ id: 'made' });
    expect(calls.createNeighbour).toHaveLength(1);
  });

  it('is for customers: a token without a customer profile is refused', async () => {
    const { svc } = service();
    await expect(
      runWithContext(asCourierWithoutProfile, () => svc.applyNeighbour('addr-1')),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('verifying a courier', () => {
  it('grants the COURIER role together with the verification, once, in one transaction', async () => {
    const calls: string[] = [];
    const prisma = {
      courier: {
        async update(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
          calls.push(`courier.update ${JSON.stringify(args.where)} ${Object.keys(args.data)}`);
          return { id: 'c1', ...args.data };
        },
      },
      userRole: {
        async upsert(args: { update: unknown; create: Record<string, unknown> }) {
          calls.push(`role.upsert ${JSON.stringify(args.create)} ${JSON.stringify(args.update)}`);
        },
      },
      async $transaction(operations: Promise<unknown>[]) {
        calls.push('transaction');
        return Promise.all(operations);
      },
    };
    const repository = new CouriersRepository(prisma as never);
    await runWithContext(asAdmin, () =>
      repository.verify('c1', 'user-courier', new Date('2026-02-01'), 'user-ADMIN'),
    );
    // Both writes are handed to one $transaction (Prisma's are lazy; this fake runs them as built).
    expect(calls).toEqual([
      'courier.update {"id":"c1","tenantId":"t1"} verifiedAt',
      // `update: {}` is what makes a second verify a no-op instead of a duplicate-role error.
      'role.upsert {"userId":"user-courier","role":"COURIER","grantedBy":"user-ADMIN"} {}',
      'transaction',
    ]);
  });

  it('is the desk’s: an operator (read-only on couriers) and the courier themself are refused', async () => {
    for (const who of [asOperator, asCourier, asCustomer]) {
      const { svc, calls } = service({ courier: courierRow({ verifiedAt: null }) });
      await expect(runWithContext(who, () => svc.verify('c1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(calls.verify).toEqual([]);
    }
  });

  it('keeps the time of the first verification when it is repeated', async () => {
    const first = new Date('2026-01-01');
    const { svc, calls } = service({ courier: courierRow({ verifiedAt: first }) });
    await runWithContext(asAdmin, () => svc.verify('c1'));
    expect(calls.verify[0]).toEqual(['c1', 'user-courier', first, 'user-ADMIN']);
  });

  it('does not reach a courier of another tenant: the lookup is scoped, so it is a 404', async () => {
    const { svc, calls } = service({ courier: null });
    await expect(runWithContext(asAdmin, () => svc.verify('c-other'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(calls.verify).toEqual([]);
  });

  it('is kept inside the desk’s rank: an ADMIN cannot verify a courier who is a SUPER_ADMIN', async () => {
    const { svc, calls } = service({ rolesOfUser: ['SUPER_ADMIN', 'COURIER'] });
    await expect(runWithContext(asAdmin, () => svc.verify('c1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(calls.verify).toEqual([]);
  });
});

describe('suspending a courier', () => {
  it('writes the status and ends their sessions at once', async () => {
    const { svc, calls } = service();
    await runWithContext(asAdmin, () => svc.suspend('c1'));
    expect(calls.setStatus).toEqual([['c1', 'SUSPENDED']]);
    expect(calls.logoutAll).toEqual(['user-courier']);
  });

  it('refuses the rest of the staff, the courier and customers', async () => {
    for (const who of [asOperator, asCourier, asCustomer]) {
      const { svc, calls } = service();
      await expect(runWithContext(who, () => svc.suspend('c1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(calls.setStatus).toEqual([]);
      expect(calls.logoutAll).toEqual([]);
    }
  });

  it('does not touch a courier of another tenant', async () => {
    const { svc, calls } = service({ courier: null });
    await expect(runWithContext(asAdmin, () => svc.suspend('c-other'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(calls.setStatus).toEqual([]);
    expect(calls.logoutAll).toEqual([]);
  });

  it('writes the tenant into the update itself, not only into the lookup before it', async () => {
    const seen: unknown[] = [];
    const prisma = {
      courier: {
        async update(args: unknown) {
          seen.push(args);
          return {};
        },
      },
    };
    const repository = new CouriersRepository(prisma as never);
    await runWithContext(asAdmin, () => repository.setStatus('c1', 'SUSPENDED'));
    expect(seen[0]).toMatchObject({ where: { id: 'c1', tenantId: 't1' } });
  });
});

describe('going on shift', () => {
  it('lets a verified courier go online', async () => {
    const { svc, calls } = service();
    await runWithContext(asCourier, () => svc.setStatus('ONLINE'));
    expect(calls.setOwnStatus).toEqual([['c1', 'ONLINE']]);
  });

  it('refuses a suspended courier, for every status and for the shift and profile reads too', async () => {
    const suspended = courierRow({ status: 'SUSPENDED' });
    for (const status of ['ONLINE', 'BUSY', 'OFFLINE']) {
      const { svc, calls } = service({ courier: suspended });
      await expect(
        runWithContext(asCourier, () => svc.setStatus(status as never)),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calls.setOwnStatus).toEqual([]);
    }
    const { svc } = service({ courier: suspended });
    await expect(runWithContext(asCourier, () => svc.shift())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(runWithContext(asCourier, () => svc.me())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses an unverified courier BUSY as well as ONLINE: only the desk’s yes lets one work', async () => {
    const { svc, calls } = service({ courier: courierRow({ verifiedAt: null }) });
    await expect(runWithContext(asCourier, () => svc.setStatus('BUSY'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(calls.setOwnStatus).toEqual([]);
  });

  it('does not write ONLINE over a suspension that landed after the profile was read', async () => {
    // The courier row read as active; by the write the desk had suspended them: the write refuses.
    const { svc } = service({ ownStatusAccepted: false });
    await expect(runWithContext(asCourier, () => svc.setStatus('ONLINE'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('makes that refusal in the write itself: not suspended, and verified for anything but OFFLINE', async () => {
    const seen: { where: Record<string, unknown> }[] = [];
    const prisma = {
      courier: {
        async updateMany(args: { where: Record<string, unknown> }) {
          seen.push(args);
          return { count: 1 };
        },
      },
    };
    const repository = new CouriersRepository(prisma as never);
    expect(await runWithContext(asCourier, () => repository.setOwnStatus('c1', 'ONLINE'))).toBe(
      true,
    );
    await runWithContext(asCourier, () => repository.setOwnStatus('c1', 'OFFLINE'));
    expect(seen[0]?.where).toMatchObject({
      id: 'c1',
      tenantId: 't1',
      status: { not: 'SUSPENDED' },
      verifiedAt: { not: null },
    });
    expect(seen[1]?.where).toMatchObject({ status: { not: 'SUSPENDED' } });
    expect(seen[1]?.where).not.toHaveProperty('verifiedAt');
  });
});

describe('editing a courier', () => {
  it('lets a courier change their own vehicle details', async () => {
    const { svc, calls } = service();
    await runWithContext(asCourier, () =>
      svc.update('c1', { vehicleType: 'CAR', plateNumber: '01A123BC' }),
    );
    expect(calls.update).toEqual([['c1', { vehicleType: 'CAR', plateNumber: '01A123BC' }]]);
  });

  it('does not let a courier raise how many orders they carry at once', async () => {
    const { svc, calls } = service();
    await expect(
      runWithContext(asCourier, () => svc.update('c1', { maxConcurrentOrders: 5 })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.update).toEqual([]);
  });

  it('takes the card posted back with the same number as no change', async () => {
    const { svc, calls } = service();
    await runWithContext(asCourier, () =>
      svc.update('c1', { vehicleType: 'FOOT', maxConcurrentOrders: 1 }),
    );
    expect(calls.update).toHaveLength(1);
  });

  it('lets the desk set it, for any courier of the tenant', async () => {
    const { svc, calls } = service();
    await runWithContext(asAdmin, () => svc.update('c1', { maxConcurrentOrders: 3 }));
    expect(calls.update).toEqual([['c1', { maxConcurrentOrders: 3 }]]);
  });

  it('refuses another courier’s card, a token with no courier profile, customers and a read-only operator', async () => {
    const otherCourier = as(['COURIER'], { courierId: 'c2' }, 'user-other');
    for (const who of [otherCourier, asCourierWithoutProfile, asCustomer, asOperator]) {
      const { svc, calls } = service();
      await expect(
        runWithContext(who, () => svc.update('c1', { plateNumber: '01A123BC' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calls.update).toEqual([]);
    }
  });

  it('is not reached for a courier of another tenant: the lookup is scoped, so it is a 404', async () => {
    const { svc, calls } = service({ courier: null });
    await expect(
      runWithContext(asAdmin, () => svc.update('c-other', { plateNumber: '01A123BC' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(calls.update).toEqual([]);
  });

  it('shuts a suspended courier out of their own card too', async () => {
    const { svc, calls } = service({ courier: courierRow({ status: 'SUSPENDED' }) });
    await expect(
      runWithContext(asCourier, () => svc.update('c1', { plateNumber: '01A123BC' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.update).toEqual([]);
  });
});

describe('reading couriers', () => {
  it('reads one courier for the desk only; the courier reads their own through me()', async () => {
    const { svc } = service();
    await expect(runWithContext(asAdmin, () => svc.get('c1'))).resolves.toMatchObject({ id: 'c1' });
    await expect(runWithContext(asOperator, () => svc.get('c1'))).resolves.toMatchObject({
      id: 'c1',
    });
    await expect(runWithContext(asCourier, () => svc.get('c1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(runWithContext(asCourier, () => svc.me())).resolves.toMatchObject({ id: 'c1' });
  });
});

describe('the roster filter', () => {
  it('reads ?onlineOnly=false as false, not as true', () => {
    expect(couriersListQuerySchema.parse({ onlineOnly: 'false' }).onlineOnly).toBe(false);
    expect(couriersListQuerySchema.parse({ onlineOnly: 'true' }).onlineOnly).toBe(true);
    expect(couriersListQuerySchema.parse({}).onlineOnly).toBeUndefined();
    expect(couriersListQuerySchema.safeParse({ onlineOnly: 'maybe' }).success).toBe(false);
  });
});
