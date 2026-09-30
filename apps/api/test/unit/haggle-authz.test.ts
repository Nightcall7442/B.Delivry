/**
 * Reading the asks on a stall and answering them took a missing vendorId on the token for "the
 * desk", so any vendor-role token without a vendor profile could read every stall's haggling and
 * answer it. Now the stall's own vendor and the desk (`order:read_any`) are the only ones in.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { HaggleService } from '../../src/modules/haggle/service/haggle.service.js';

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
const asStallVendor = as(['VENDOR'], { vendorId: STALL_VENDOR });
const asOtherVendor = as(['VENDOR'], { vendorId: 'vendor-other' });
/** Holds the vendor role but no vendor profile rides on the token. */
const asVendorWithoutProfile = as(['VENDOR']);

function service() {
  const answered: { id: string; status: string }[] = [];
  const told: unknown[] = [];
  const listed: string[] = [];
  const stores: Record<string, { vendorId: string; tenantId: string }> = {
    'st-stall': { vendorId: STALL_VENDOR, tenantId: 't1' },
    'st-other': { vendorId: 'vendor-other', tenantId: 't1' },
  };
  const ask = (storeId: string) => ({
    id: `ask-on-${storeId}`,
    tenantId: 't1',
    customerId: 'cust-1',
    storeId,
    productId: 'prod-1',
    askedPrice: 8_000,
    offeredPrice: null,
    status: 'PENDING',
    message: null,
    reply: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    product: { name: { ru: 'Яблоки' }, price: 10_000, currency: 'UZS', storeId },
  });
  const svc = new HaggleService({
    prisma: {
      store: {
        async findFirst({ where }: { where: { id: string } }) {
          return stores[where.id] ?? null;
        },
      },
      discountRequest: {
        async findFirst({ where }: { where: { id: string } }) {
          return ask(where.id.replace('ask-on-', ''));
        },
        async findMany({ where }: { where: { storeId: string } }) {
          listed.push(where.storeId);
          return [ask(where.storeId)];
        },
        async update({ where, data }: { where: { id: string }; data: { status: string } }) {
          answered.push({ id: where.id, status: data.status });
          return { ...ask(where.id.replace('ask-on-', '')), ...data };
        },
      },
    },
    queue: {
      async enqueue(...args: unknown[]) {
        told.push(args);
      },
    },
    realtime: {
      async emit(...args: unknown[]) {
        told.push(args);
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, answered, told, listed };
}

describe('the asks on a stall', () => {
  it('are read by the stall’s vendor and by the desk', async () => {
    for (const who of [asStallVendor, asAdmin]) {
      const { svc, listed } = service();
      await runWithContext(who, () => svc.forStore('st-stall'));
      expect(listed).toEqual(['st-stall']);
    }
  });

  it('are kept from another stall’s vendor, a vendor-role token with no profile, and a customer', async () => {
    for (const who of [asOtherVendor, asVendorWithoutProfile, asCustomer]) {
      const { svc, listed } = service();
      await expect(runWithContext(who, () => svc.forStore('st-stall'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(listed).toEqual([]);
    }
  });
});

describe('answering an ask', () => {
  it('is for the vendor of the stall the ask was made at, and for the desk', async () => {
    for (const who of [asStallVendor, asAdmin]) {
      const { svc, answered, told } = service();
      await runWithContext(who, () =>
        svc.answer('ask-on-st-stall', { accept: true, price: 9_000 }),
      );
      expect(answered).toEqual([{ id: 'ask-on-st-stall', status: 'ACCEPTED' }]);
      expect(told.length).toBeGreaterThan(0);
    }
  });

  it('is refused to the vendor of another stall, and nothing is sent to the customer', async () => {
    const { svc, answered, told } = service();
    await expect(
      runWithContext(asOtherVendor, () => svc.answer('ask-on-st-stall', { accept: true })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(answered).toEqual([]);
    expect(told).toEqual([]);
  });

  it('is refused to a vendor-role token with no profile, and to the customer who asked', async () => {
    for (const who of [asVendorWithoutProfile, asCustomer]) {
      const { svc, answered, told } = service();
      await expect(
        runWithContext(who, () => svc.answer('ask-on-st-stall', { accept: false })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(answered).toEqual([]);
      expect(told).toEqual([]);
    }
  });

  it('follows the ask, not the caller: a vendor cannot answer on a stall that is not theirs', async () => {
    const { svc, answered } = service();
    await expect(
      runWithContext(asStallVendor, () => svc.answer('ask-on-st-other', { accept: true })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(answered).toEqual([]);
  });
});
