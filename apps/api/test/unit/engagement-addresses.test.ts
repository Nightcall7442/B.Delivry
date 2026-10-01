/**
 * An address belongs to exactly one customer and is read and changed through that customer's id
 * from the token, never one from the request. Couriers and vendors have no route into the book:
 * they get the copy frozen onto the order. The writes by bare id (update, default, delete) now carry
 * the tenant as well, whatever lookup came before them.
 *
 * Real AddressesService and AddressesRepository, real roles; geo and Prisma are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { AddressesRepository } from '../../src/modules/addresses/repository/addresses.repository.js';
import { AddressesService } from '../../src/modules/addresses/service/addresses.service.js';

const TENANT = 't1';

const ctx = (user: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const as = (
  name: string,
  roles: Role[],
  ids: { customerId?: string; vendorId?: string; courierId?: string } = {},
) =>
  ctx({
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  });

const asCustomer = as('cust-1', [ROLE.CUSTOMER], { customerId: 'cust-1' });
const asOtherCustomer = as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' });
const asCourier = as('courier-1', [ROLE.COURIER], { courierId: 'courier-1' });
const asVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asOperator = as('operator', [ROLE.OPERATOR]);

function service() {
  const writes: string[] = [];
  const book = [
    {
      id: 'a1',
      customerId: 'cust-1',
      cityId: 'city-1',
      lat: null,
      lng: null,
      street: 'Мира',
      house: null,
      apartment: null,
      entrance: null,
      floor: null,
      landmark: null,
      instructions: null,
    },
  ];
  const repository = {
    async listForCustomer(customerId: string) {
      return book.filter((a) => a.customerId === customerId);
    },
    async findById(id: string, customerId?: string) {
      return (
        book.find(
          (a) => a.id === id && (customerId === undefined || a.customerId === customerId),
        ) ?? null
      );
    },
    async countForCustomer() {
      return 0;
    },
    async create(customerId: string) {
      writes.push(`create:${customerId}`);
      return { id: 'a2', customerId };
    },
    async update(id: string) {
      writes.push(`update:${id}`);
      return book[0];
    },
    async setDefault(customerId: string, id: string) {
      writes.push(`default:${customerId}:${id}`);
    },
    async softDelete(id: string) {
      writes.push(`delete:${id}`);
    },
  };
  const svc = new AddressesService({
    repository,
    geo: {
      async resolveZone() {
        return { deliverable: false, cityId: null };
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, writes };
}

describe('a customer’s address book', () => {
  it('lists and reads the caller’s own addresses', async () => {
    const { svc } = service();
    await expect(runWithContext(asCustomer, () => svc.list())).resolves.toHaveLength(1);
    await expect(runWithContext(asCustomer, () => svc.get('a1'))).resolves.toMatchObject({
      id: 'a1',
    });
    await expect(runWithContext(asOtherCustomer, () => svc.list())).resolves.toEqual([]);
  });

  it('does not show, change, default, delete or probe another customer’s address', async () => {
    const { svc, writes } = service();
    const acts: (() => Promise<unknown>)[] = [
      () => svc.get('a1'),
      () => svc.update('a1', { street: 'Elsewhere' }),
      () => svc.setDefault('a1'),
      () => svc.remove('a1'),
      () => svc.isDeliverable('a1'),
    ];
    for (const act of acts) {
      await expect(runWithContext(asOtherCustomer, act)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(writes).toEqual([]);
  });

  it.each([
    ['a courier', asCourier],
    ['a vendor', asVendor],
    ['an operator, who has no customer profile', asOperator],
  ] as [string, RequestContext][])('is closed to %s', async (_, who) => {
    const { svc, writes } = service();
    const acts: (() => Promise<unknown>)[] = [
      () => svc.list(),
      () => svc.get('a1'),
      () => svc.create({ cityId: 'city-1', street: 'x', label: 'HOME', isDefault: false }),
      () => svc.update('a1', { street: 'x' }),
      () => svc.remove('a1'),
    ];
    for (const act of acts) {
      await expect(runWithContext(who, act)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(writes).toEqual([]);
  });

  it('hands the order flow a frozen copy only for the customer it names', async () => {
    const { svc } = service();
    await expect(svc.getFrozen('a1', 'cust-2')).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.getFrozen('a1', 'cust-1')).resolves.toMatchObject({ street: 'Мира' });
  });
});

describe('the addresses table', () => {
  function recording() {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const record = (op: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return result;
    };
    const prisma = {
      address: {
        findFirst: record('findFirst', null),
        findMany: record('findMany', []),
        update: record('update', {}),
        updateMany: record('updateMany', { count: 1 }),
      },
      async $transaction(ops: unknown[]) {
        return Promise.all(ops);
      },
    };
    return { repository: new AddressesRepository(prisma as never), calls };
  }

  it('reads inside the tenant, for the customer, and not what was deleted', async () => {
    const { repository, calls } = recording();
    await runWithContext(asCustomer, async () => {
      await repository.listForCustomer('cust-1');
      await repository.findById('a1', 'cust-1');
    });
    expect(calls.map((c) => c.args['where'])).toEqual([
      { customerId: 'cust-1', deletedAt: null, tenantId: TENANT },
      { id: 'a1', deletedAt: null, customerId: 'cust-1', tenantId: TENANT },
    ]);
  });

  it('writes by id only inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asCustomer, async () => {
      await repository.update('a1', { street: 'x' });
      await repository.setDefault('cust-1', 'a1');
      await repository.softDelete('a1');
    });
    const updates = calls.filter((c) => c.op === 'update').map((c) => c.args['where']);
    expect(updates).toEqual([
      { id: 'a1', tenantId: TENANT },
      { id: 'a1', tenantId: TENANT },
      { id: 'a1', tenantId: TENANT },
    ]);
  });
});
