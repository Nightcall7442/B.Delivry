/**
 * `POST /vendors` is open to anyone signed in and took `userId` from the body, so any user could
 * create a Vendor row bound to ANOTHER user, with a legal name, phone and bank account of their
 * choosing. Applying is for oneself; only those who hold `vendor:write` register someone else.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { VendorsRepository } from '../../src/modules/vendors/repository/vendors.repository.js';
import { VendorsService } from '../../src/modules/vendors/service/vendors.service.js';
import type { CreateVendorInput } from '../../src/modules/vendors/types/index.js';

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
const asOperator = as(['OPERATOR']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
/** Already trading: their row exists under their own user id. */
const asVendor = as(['VENDOR'], { vendorId: 'vendor-1' });

const application = (userId: string): CreateVendorInput => ({
  userId,
  legalType: 'UNREGISTERED',
  legalName: 'Иванов И.',
  displayName: 'Лавка',
  phone: '+998901234567',
  bankAccount: '8600 0000 0000 0000',
});

function service(vendorsByUser: Record<string, object> = {}) {
  const created: CreateVendorInput[] = [];
  const svc = new VendorsService({
    repository: {
      async findByUserId(userId: string) {
        return vendorsByUser[userId] ?? null;
      },
      async create(input: CreateVendorInput) {
        created.push(input);
        return { id: 'new-vendor', ...input };
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, created };
}

describe('applying to become a vendor', () => {
  it('is for oneself: a body naming another user still binds the record to the caller', async () => {
    const { svc, created } = service();
    await runWithContext(asCustomer, () => svc.register(application('user-victim')));
    expect(created).toHaveLength(1);
    expect(created[0]?.userId).toBe('user-CUSTOMER');
    // The rest of the application is theirs to fill in.
    expect(created[0]).toMatchObject({ legalName: 'Иванов И.', phone: '+998901234567' });
  });

  it('cannot take over a user who already trades: their vendor row is not touched', async () => {
    const { svc, created } = service({ 'user-victim': { id: 'vendor-victim' } });
    await runWithContext(asCustomer, () => svc.register(application('user-victim')));
    expect(created.map((row) => row.userId)).toEqual(['user-CUSTOMER']);
  });

  it('refuses a caller who is already a vendor', async () => {
    const { svc, created } = service({ 'user-VENDOR': { id: 'vendor-1' } });
    await expect(
      runWithContext(asVendor, () => svc.register(application('user-someone-else'))),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(created).toEqual([]);
  });

  it('is forced to the caller for the desk that may only read vendors, too', async () => {
    const { svc, created } = service();
    await runWithContext(asOperator, () => svc.register(application('user-someone-else')));
    expect(created[0]?.userId).toBe('user-OPERATOR');
  });

  it('may name another user for those who hold vendor:write', async () => {
    const { svc, created } = service();
    await runWithContext(asAdmin, () => svc.register(application('user-new-seller')));
    expect(created[0]?.userId).toBe('user-new-seller');
  });

  it('still refuses to overwrite an existing vendor when the desk names one', async () => {
    const { svc, created } = service({ 'user-seller': { id: 'vendor-seller' } });
    await expect(
      runWithContext(asAdmin, () => svc.register(application('user-seller'))),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(created).toEqual([]);
  });
});

describe('«Стать продавцом»: the application and the desk’s answer', () => {
  it('applies for the caller when the body names nobody', async () => {
    const { svc, created } = service();
    const { userId: _named, ...anonymous } = application('ignored');
    await runWithContext(asCustomer, () => svc.register(anonymous));
    expect(created[0]?.userId).toBe('user-CUSTOMER');
  });

  it('shows the applicant their own row in any state, and nothing to someone who never applied', async () => {
    const createdAt = new Date('2026-10-01T09:00:00Z');
    const { svc } = service({
      'user-CUSTOMER': { id: 'v-1', status: 'PENDING', displayName: 'Лавка', createdAt },
    });
    expect(await runWithContext(asCustomer, () => svc.myApplication())).toEqual({
      id: 'v-1',
      status: 'PENDING',
      displayName: 'Лавка',
      createdAt,
    });
    expect(await runWithContext(asOperator, () => svc.myApplication())).toBeNull();
  });

  function desk(vendorUserRoles: string[] = ['CUSTOMER']) {
    const statuses: { id: string; status: string; approval: unknown }[] = [];
    const svc = new VendorsService({
      repository: {
        async findById(id: string) {
          return { id, userId: 'user-applicant', status: 'PENDING' };
        },
        async rolesOfUser() {
          return vendorUserRoles;
        },
        async setStatus(id: string, status: string, approval: unknown) {
          statuses.push({ id, status, approval });
        },
      },
      auth: { async logoutAll() {} },
      logger: { error() {}, warn() {}, info() {}, debug() {} },
      events: { async publish() {} },
    } as never);
    return { svc, statuses };
  }

  it('approval names the applicant, so the VENDOR role is granted with it', async () => {
    const { svc, statuses } = desk();
    await runWithContext(asAdmin, () => svc.setStatus('v-1', 'ACTIVE'));
    expect(statuses).toEqual([
      {
        id: 'v-1',
        status: 'ACTIVE',
        approval: { userId: 'user-applicant', grantedBy: 'user-ADMIN' },
      },
    ]);
  });
});

describe('VendorsRepository.setStatus', () => {
  function prisma() {
    const calls: { op: string; args: unknown }[] = [];
    const client = {
      vendor: {
        update(args: unknown) {
          calls.push({ op: 'vendor.update', args });
          return { id: 'v-1' };
        },
      },
      userRole: {
        upsert(args: unknown) {
          calls.push({ op: 'userRole.upsert', args });
          return {};
        },
      },
      async $transaction(ops: unknown[]) {
        calls.push({ op: '$transaction', args: ops.length });
        return ops;
      },
    };
    return { client, calls };
  }

  it('grants VENDOR in the same transaction as the approval, and only for an approval', async () => {
    const approve = prisma();
    const repo = new VendorsRepository(approve.client as never);
    await runWithContext(asAdmin, () =>
      repo.setStatus('v-1', 'ACTIVE', { userId: 'user-applicant', grantedBy: 'user-ADMIN' }),
    );
    expect(approve.calls.map((c) => c.op)).toEqual([
      'vendor.update',
      'userRole.upsert',
      '$transaction',
    ]);
    expect(approve.calls[1]?.args).toMatchObject({
      where: { userId_role: { userId: 'user-applicant', role: 'VENDOR' } },
      create: { userId: 'user-applicant', role: 'VENDOR', grantedBy: 'user-ADMIN' },
    });

    const reject = prisma();
    await runWithContext(asAdmin, () =>
      new VendorsRepository(reject.client as never).setStatus('v-1', 'REJECTED', {
        userId: 'user-applicant',
        grantedBy: 'user-ADMIN',
      }),
    );
    expect(reject.calls.map((c) => c.op)).toEqual(['vendor.update']);
  });
});
