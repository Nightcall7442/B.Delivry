/**
 * Customer and vendor profiles. Blocking a customer and suspending or rejecting a vendor were stored but
 * never enforced, never ended a session and (ids straight into `update({ where: { id } })`) were not
 * tenant-scoped. Reading one customer or vendor, a vendor's payout and editing a vendor asked `can()`
 * with a resource, and the matrix has no `_any` twin for those permissions, so every operator and admin
 * was refused (only a SUPER_ADMIN got through) while the rule that was meant to keep strangers out
 * relied on the permission alone. Who reads or edits what now follows the roles.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { CustomersRepository } from '../../src/modules/customers/repository/customers.repository.js';
import { customersListQuerySchema } from '../../src/modules/customers/schemas/index.js';
import { CustomersService } from '../../src/modules/customers/service/customers.service.js';
import { VendorsRepository } from '../../src/modules/vendors/repository/vendors.repository.js';
import { VendorsService } from '../../src/modules/vendors/service/vendors.service.js';

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
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' }, 'user-cust-1');
const asStranger = as(['CUSTOMER'], { customerId: 'cust-2' }, 'user-cust-2');
const asVendor = as(['VENDOR'], { vendorId: 'v1' }, 'user-vendor-1');
const asOtherVendor = as(['VENDOR'], { vendorId: 'v2' }, 'user-vendor-2');
/** Holds the role, but no profile rides on the token. */
const asVendorWithoutProfile = as(['VENDOR'], {}, 'user-vendor-3');

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const events = { async publish() {} };

// ------------------------------------------------------------------ customers

function customerRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'cust-1',
    tenantId: 't1',
    userId: 'user-cust-1',
    blockedAt: null,
    orderCount: 0,
    referredById: null,
    businessApprovedAt: null,
    companyName: null,
    companyInn: null,
    ...extra,
  };
}

function customers(
  options: {
    row?: Record<string, unknown> | null;
    userRoles?: string[];
    ownsAddress?: boolean;
    referrer?: { id: string; userId: string } | null;
  } = {},
) {
  const calls = {
    setBlocked: [] as unknown[],
    logoutAll: [] as string[],
    update: [] as unknown[],
    business: [] as unknown[],
    adjust: [] as unknown[],
    lookups: [] as string[],
    referredBy: [] as unknown[],
  };
  const row = options.row === undefined ? customerRow() : options.row;
  const svc = new CustomersService({
    repository: {
      async findById(id: string) {
        calls.lookups.push(id);
        return row !== null && id === row.id ? row : null;
      },
      async setBlocked(id: string, blocked: boolean) {
        calls.setBlocked.push([id, blocked]);
      },
      async rolesOfUser() {
        return options.userRoles ?? ['CUSTOMER'];
      },
      async ownsAddress() {
        return options.ownsAddress ?? true;
      },
      async update(id: string, input: unknown) {
        calls.update.push([id, input]);
        return { ...customerRow(), ...(input as object) };
      },
      async applyBusiness(id: string, name: string, inn: string) {
        calls.business.push([id, name, inn]);
        return customerRow({ companyName: name, companyInn: inn });
      },
      async adjustBalance(id: string, delta: number) {
        calls.adjust.push([id, delta]);
      },
      async findByReferralCode() {
        return options.referrer === undefined
          ? { id: 'cust-9', userId: 'user-9' }
          : options.referrer;
      },
      async setReferredBy(...args: unknown[]) {
        calls.referredBy.push(args);
      },
      async ensureReferralCode() {
        return 'ABC234';
      },
    },
    auth: {
      async logoutAll(userId: string) {
        calls.logoutAll.push(userId);
      },
    },
    logger,
    events,
  } as never);
  return { svc, calls };
}

describe('a blocked customer', () => {
  const blocked = customerRow({ blockedAt: new Date('2026-05-01') });

  it('is refused on their own profile, even with a token issued before the block', async () => {
    const { svc, calls } = customers({ row: blocked });
    await expect(runWithContext(asCustomer, () => svc.me())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asCustomer, () => svc.updateMe({ marketingOptIn: false })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(runWithContext(asCustomer, () => svc.referral())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      runWithContext(asCustomer, () => svc.applyReferral('ABC234')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asCustomer, () => svc.applyBusiness('Кафе Урганч', '123456789')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.update).toEqual([]);
    expect(calls.business).toEqual([]);
    expect(calls.referredBy).toEqual([]);
  });

  it('is not blocked from reading their own profile by id either', async () => {
    const { svc } = customers({ row: blocked });
    await expect(runWithContext(asCustomer, () => svc.get('cust-1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('blocking and unblocking a customer', () => {
  it('writes the block and ends their sessions at once; lifting it needs no sign-out', async () => {
    const { svc, calls } = customers();
    await runWithContext(asAdmin, () => svc.block('cust-1'));
    expect(calls.setBlocked).toEqual([['cust-1', true]]);
    expect(calls.logoutAll).toEqual(['user-cust-1']);

    await runWithContext(asAdmin, () => svc.unblock('cust-1'));
    expect(calls.setBlocked).toEqual([
      ['cust-1', true],
      ['cust-1', false],
    ]);
    expect(calls.logoutAll).toEqual(['user-cust-1']);
  });

  it('does not reach a customer of another tenant: the lookup is scoped, so it is a 404', async () => {
    const { svc, calls } = customers({ row: null });
    await expect(runWithContext(asAdmin, () => svc.block('cust-other'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(runWithContext(asAdmin, () => svc.unblock('cust-other'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(calls.setBlocked).toEqual([]);
    expect(calls.logoutAll).toEqual([]);
  });

  it('is the admin’s: operators and customers are refused', async () => {
    for (const who of [asOperator, asCustomer, asStranger]) {
      const { svc, calls } = customers();
      await expect(runWithContext(who, () => svc.block('cust-1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(calls.setBlocked).toEqual([]);
    }
  });

  it('stays inside the desk’s rank: an ADMIN cannot block the customer profile of a SUPER_ADMIN', async () => {
    const { svc, calls } = customers({ userRoles: ['SUPER_ADMIN', 'CUSTOMER'] });
    await expect(runWithContext(asAdmin, () => svc.block('cust-1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(calls.setBlocked).toEqual([]);
    expect(calls.logoutAll).toEqual([]);
  });

  it('puts the tenant into the writes themselves', async () => {
    const seen: { where: Record<string, unknown> }[] = [];
    const prisma = {
      customer: {
        async update(args: { where: Record<string, unknown> }) {
          seen.push(args);
          return {};
        },
      },
    };
    const repository = new CustomersRepository(prisma as never);
    await runWithContext(asAdmin, () => repository.setBlocked('cust-1', true));
    await runWithContext(asAdmin, () => repository.adjustBalance('cust-1', 500));
    expect(seen.map((call) => call.where)).toEqual([
      { id: 'cust-1', tenantId: 't1' },
      { id: 'cust-1', tenantId: 't1' },
    ]);
  });
});

describe('reading one customer', () => {
  it('the desk reads any customer of its tenant: operators and admins, who hold customer:read', async () => {
    for (const who of [asAdmin, asOperator]) {
      const { svc } = customers();
      await expect(runWithContext(who, () => svc.get('cust-1'))).resolves.toMatchObject({
        id: 'cust-1',
      });
    }
  });

  it('a customer reads their own profile and no one else’s, and a stranger learns nothing about ids', async () => {
    const own = customers();
    await expect(runWithContext(asCustomer, () => own.svc.get('cust-1'))).resolves.toMatchObject({
      id: 'cust-1',
    });

    const other = customers();
    await expect(runWithContext(asStranger, () => other.svc.get('cust-1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    // Refused before the lookup: 403 for a real id and an invented one alike.
    expect(other.calls.lookups).toEqual([]);
  });

  it('a token with no customer profile reads nobody', async () => {
    const { svc, calls } = customers();
    await expect(
      runWithContext(as(['COURIER'], { courierId: 'c1' }), () => svc.get('cust-1')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.lookups).toEqual([]);
  });
});

describe('crediting a customer', () => {
  it('moves money only for a customer of the caller’s tenant', async () => {
    const own = customers();
    await runWithContext(asAdmin, () => own.svc.credit('cust-1', 5_000));
    expect(own.calls.adjust).toEqual([['cust-1', 5_000]]);

    const other = customers({ row: null });
    await expect(
      runWithContext(asAdmin, () => other.svc.credit('cust-other', 5_000)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(other.calls.adjust).toEqual([]);
  });

  it('is the refund desk’s: an operator is refused', async () => {
    const { svc, calls } = customers();
    await expect(
      runWithContext(asOperator, () => svc.credit('cust-1', 5_000)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.adjust).toEqual([]);
  });
});

describe('editing one’s own profile', () => {
  it('the default address must be one of the customer’s own', async () => {
    const foreign = customers({ ownsAddress: false });
    await expect(
      runWithContext(asCustomer, () =>
        foreign.svc.updateMe({ defaultAddressId: 'addr-of-someone-else' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(foreign.calls.update).toEqual([]);

    const own = customers({ ownsAddress: true });
    await runWithContext(asCustomer, () => own.svc.updateMe({ defaultAddressId: 'addr-1' }));
    expect(own.calls.update).toEqual([['cust-1', { defaultAddressId: 'addr-1' }]]);

    // Clearing it, or not touching it, asks nobody anything.
    await runWithContext(asCustomer, () => foreign.svc.updateMe({ defaultAddressId: null }));
    await runWithContext(asCustomer, () => foreign.svc.updateMe({ marketingOptIn: false }));
    expect(foreign.calls.update).toHaveLength(2);
  });

  it('looks the address up among the customer’s live ones, inside the tenant', async () => {
    const seen: unknown[] = [];
    const prisma = {
      address: {
        async count(args: unknown) {
          seen.push(args);
          return 1;
        },
      },
    };
    const repository = new CustomersRepository(prisma as never);
    expect(await runWithContext(asCustomer, () => repository.ownsAddress('cust-1', 'addr-1'))).toBe(
      true,
    );
    expect(seen[0]).toEqual({
      where: { id: 'addr-1', customerId: 'cust-1', tenantId: 't1', deletedAt: null },
    });
  });
});

describe('the company on an invoice', () => {
  it('an approved company cannot be swapped for another by applying again', async () => {
    const approved = customerRow({
      businessApprovedAt: new Date('2026-04-01'),
      companyName: 'Кафе Урганч',
      companyInn: '123456789',
    });
    const { svc, calls } = customers({ row: approved });
    await expect(
      runWithContext(asCustomer, () => svc.applyBusiness('Другая компания', '987654321')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(calls.business).toEqual([]);

    // The same company again is no change.
    await runWithContext(asCustomer, () => svc.applyBusiness('Кафе Урганч', '123456789'));
    expect(calls.business).toHaveLength(1);
  });

  it('a company that is not yet approved may still be corrected', async () => {
    const pending = customerRow({ companyName: 'Кафе', companyInn: '111111111' });
    const { svc, calls } = customers({ row: pending });
    await runWithContext(asCustomer, () => svc.applyBusiness('Кафе Урганч', '123456789'));
    expect(calls.business).toEqual([['cust-1', 'Кафе Урганч', '123456789']]);
  });
});

describe('a friend’s code', () => {
  it('is looked up inside the tenant: the code is unique platform-wide, but a code from another tenant is no friend’s', async () => {
    const seen: { where: Record<string, unknown> }[] = [];
    const prisma = {
      customer: {
        async findFirst(args: { where: Record<string, unknown> }) {
          seen.push(args);
          return null;
        },
      },
    };
    const repository = new CustomersRepository(prisma as never);
    await runWithContext(asCustomer, () => repository.findByReferralCode('ABC234'));
    expect(seen[0]?.where).toEqual({ referralCode: 'ABC234', tenantId: 't1' });
  });
});

describe('the customers list filter', () => {
  it('reads ?blocked=false as false, not as true', () => {
    expect(customersListQuerySchema.parse({ blocked: 'false' }).blocked).toBe(false);
    expect(customersListQuerySchema.parse({ blocked: 'true' }).blocked).toBe(true);
    expect(customersListQuerySchema.parse({}).blocked).toBeUndefined();
  });
});

// -------------------------------------------------------------------- vendors

function vendorRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    tenantId: 't1',
    userId: 'user-vendor-1',
    status: 'ACTIVE',
    ...extra,
  };
}

function vendors(options: { row?: Record<string, unknown> | null; userRoles?: string[] } = {}) {
  const calls = {
    update: [] as unknown[],
    setStatus: [] as unknown[],
    logoutAll: [] as string[],
    lookups: [] as string[],
    payouts: [] as string[],
  };
  const row = options.row === undefined ? vendorRow() : options.row;
  const svc = new VendorsService({
    repository: {
      async findById(id: string) {
        calls.lookups.push(id);
        return row !== null && id === row.id ? row : null;
      },
      async update(id: string, data: unknown) {
        calls.update.push([id, data]);
        return { ...vendorRow(), ...(data as object) };
      },
      async setStatus(id: string, status: string) {
        calls.setStatus.push([id, status]);
      },
      async rolesOfUser() {
        return options.userRoles ?? ['VENDOR'];
      },
      async pendingPayout(id: string) {
        calls.payouts.push(id);
        return { vendorId: id, pending: 0, currency: 'UZS', orderCount: 0 };
      },
    },
    auth: {
      async logoutAll(userId: string) {
        calls.logoutAll.push(userId);
      },
    },
    logger,
    events,
  } as never);
  return { svc, calls };
}

describe('a vendor the desk has shut', () => {
  it('a suspended or rejected vendor is refused on their own row and payout, a PENDING one is not', async () => {
    for (const status of ['SUSPENDED', 'REJECTED']) {
      const { svc, calls } = vendors({ row: vendorRow({ status }) });
      await expect(runWithContext(asVendor, () => svc.me())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(runWithContext(asVendor, () => svc.myPayout())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(asVendor, () => svc.get('v1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(calls.payouts).toEqual([]);
    }
    // A new seller opens the cabinet while the desk looks at them.
    for (const status of ['PENDING', 'ACTIVE']) {
      const { svc } = vendors({ row: vendorRow({ status }) });
      await expect(runWithContext(asVendor, () => svc.me())).resolves.toMatchObject({ id: 'v1' });
      await expect(runWithContext(asVendor, () => svc.myPayout())).resolves.toMatchObject({
        vendorId: 'v1',
      });
    }
  });
});

describe('changing a vendor’s status', () => {
  it('suspending or rejecting ends their sessions at once; approving or reinstating does not', async () => {
    for (const status of ['SUSPENDED', 'REJECTED'] as const) {
      const { svc, calls } = vendors();
      await runWithContext(asAdmin, () => svc.setStatus('v1', status));
      expect(calls.setStatus).toEqual([['v1', status]]);
      expect(calls.logoutAll).toEqual(['user-vendor-1']);
    }
    for (const status of ['ACTIVE', 'PENDING'] as const) {
      const { svc, calls } = vendors();
      await runWithContext(asAdmin, () => svc.setStatus('v1', status));
      expect(calls.setStatus).toEqual([['v1', status]]);
      expect(calls.logoutAll).toEqual([]);
    }
  });

  it('does not reach a vendor of another tenant: the lookup is scoped, so it is a 404', async () => {
    const { svc, calls } = vendors({ row: null });
    await expect(
      runWithContext(asAdmin, () => svc.setStatus('v-other', 'SUSPENDED')),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      runWithContext(asAdmin, () => svc.setCommission('v-other', 5)),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(calls.setStatus).toEqual([]);
    expect(calls.update).toEqual([]);
    expect(calls.logoutAll).toEqual([]);
  });

  it('is the admin’s: an operator and the vendor themselves are refused (a vendor cannot approve themselves)', async () => {
    for (const who of [asOperator, asVendor, asCustomer]) {
      const { svc, calls } = vendors({ row: vendorRow({ status: 'PENDING' }) });
      await expect(runWithContext(who, () => svc.setStatus('v1', 'ACTIVE'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(calls.setStatus).toEqual([]);
    }
  });

  it('stays inside the desk’s rank: an ADMIN cannot suspend the vendor profile of a SUPER_ADMIN', async () => {
    const { svc, calls } = vendors({ userRoles: ['SUPER_ADMIN', 'VENDOR'] });
    await expect(
      runWithContext(asAdmin, () => svc.setStatus('v1', 'SUSPENDED')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.setStatus).toEqual([]);
    expect(calls.logoutAll).toEqual([]);
  });

  it('puts the tenant into the writes themselves', async () => {
    const seen: { where: Record<string, unknown> }[] = [];
    const prisma = {
      vendor: {
        async update(args: { where: Record<string, unknown> }) {
          seen.push(args);
          return {};
        },
      },
    };
    const repository = new VendorsRepository(prisma as never);
    await runWithContext(asAdmin, () => repository.setStatus('v1', 'ACTIVE'));
    await runWithContext(asAdmin, () => repository.update('v1', { displayName: 'Лавка' }));
    expect(seen.map((call) => call.where)).toEqual([
      { id: 'v1', tenantId: 't1' },
      { id: 'v1', tenantId: 't1' },
    ]);
  });
});

describe('reading and editing a vendor', () => {
  it('the desk reads any vendor of its tenant and its payout: operators and admins', async () => {
    for (const who of [asAdmin, asOperator]) {
      const { svc } = vendors();
      await expect(runWithContext(who, () => svc.get('v1'))).resolves.toMatchObject({ id: 'v1' });
      await expect(runWithContext(who, () => svc.payout('v1'))).resolves.toMatchObject({
        vendorId: 'v1',
      });
    }
  });

  it('a vendor reads their own row and payout and no other vendor’s, and a stranger learns nothing about ids', async () => {
    const own = vendors();
    await expect(runWithContext(asVendor, () => own.svc.get('v1'))).resolves.toMatchObject({
      id: 'v1',
    });
    await expect(runWithContext(asVendor, () => own.svc.payout('v1'))).resolves.toMatchObject({
      vendorId: 'v1',
    });

    for (const who of [asOtherVendor, asVendorWithoutProfile, asCustomer]) {
      const other = vendors();
      await expect(runWithContext(who, () => other.svc.get('v1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(who, () => other.svc.payout('v1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(other.calls.payouts).toEqual([]);
    }
    // Refused before the lookup, so 403 for a real id and an invented one alike.
    const probe = vendors();
    const attempts: (() => Promise<unknown>)[] = [
      () => probe.svc.get('v1'),
      () => probe.svc.payout('v1'),
      () => probe.svc.update('v1', { displayName: 'Чужая лавка' }),
    ];
    for (const attempt of attempts) {
      await expect(runWithContext(asOtherVendor, attempt)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(probe.calls.lookups).toEqual([]);
  });

  it('the desk edits the legal details of any vendor; vendors, operators and customers do not', async () => {
    const { svc, calls } = vendors();
    await runWithContext(asAdmin, () =>
      svc.update('v1', { displayName: 'Новая лавка', bankAccount: '8600 1111' }),
    );
    expect(calls.update).toEqual([
      ['v1', { displayName: 'Новая лавка', bankAccount: '8600 1111' }],
    ]);

    for (const who of [asVendor, asOperator, asCustomer, asOtherVendor]) {
      const attempt = vendors();
      await expect(
        runWithContext(who, () => attempt.svc.update('v1', { bankAccount: '8600 9999' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(attempt.calls.update).toEqual([]);
    }
  });
});

describe('registering a vendor', () => {
  it('only for a user of the caller’s tenant: the row is bound by id, so another tenant’s user is a 404', async () => {
    const looked: { where: Record<string, unknown> }[] = [];
    const created: unknown[] = [];
    const prisma = {
      user: {
        async findFirst(args: { where: Record<string, unknown> }) {
          looked.push(args);
          return args.where.id === 'user-here' ? { id: 'user-here' } : null;
        },
      },
      vendor: {
        async create(args: unknown) {
          created.push(args);
          return { id: 'new' };
        },
      },
    };
    const repository = new VendorsRepository(prisma as never);
    const application = {
      legalType: 'UNREGISTERED' as const,
      legalName: 'Иванов И.',
      displayName: 'Лавка',
      phone: '+998901234567',
    };

    await expect(
      runWithContext(asAdmin, () =>
        repository.create({ ...application, userId: 'user-elsewhere' }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(created).toEqual([]);

    await runWithContext(asAdmin, () => repository.create({ ...application, userId: 'user-here' }));
    expect(created).toHaveLength(1);
    expect(looked[0]?.where).toEqual({ id: 'user-elsewhere', tenantId: 't1', deletedAt: null });
  });
});
