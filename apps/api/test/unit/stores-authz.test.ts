/**
 * `store:write` is held by every vendor, so the stall's own edit was the only fence: a vendor could
 * PATCH `status` and approve their own stall (PENDING_REVIEW) or lift a suspension, and hand
 * themselves the platform's badges and chain. The arrivals and the report took a missing vendorId
 * on the token for "the desk". Who may do what now follows the roles, through the real `can()`.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { StoresService } from '../../src/modules/stores/service/stores.service.js';

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
const asOperator = as(['OPERATOR']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
const asStallVendor = as(['VENDOR'], { vendorId: STALL_VENDOR });
const asOtherVendor = as(['VENDOR'], { vendorId: 'vendor-other' });
/** Holds the vendor role but no vendor profile rides on the token. */
const asVendorWithoutProfile = as(['VENDOR']);

function service(status: string = 'ACTIVE', extra: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = [];
  const schedules: unknown[] = [];
  const reads = { products: 0, orders: 0 };
  const enqueued: unknown[] = [];
  const store = {
    id: 'st1',
    tenantId: 't1',
    vendorId: STALL_VENDOR,
    name: { ru: 'Лавка' },
    status,
    tags: [] as string[],
    chainSlug: null as string | null,
    promotedUntil: null,
    schedule: [],
    ...extra,
  };
  const svc = new StoresService({
    repository: {
      async findById() {
        return store;
      },
      async update(_id: string, data: Record<string, unknown>) {
        updates.push(data);
        return { ...store, ...data };
      },
      async replaceSchedule(_id: string, entries: unknown) {
        schedules.push(entries);
      },
    },
    prisma: {
      product: {
        async findMany() {
          reads.products += 1;
          return [{ id: 'p1', name: { ru: 'Яблоки' } }];
        },
        async updateMany() {
          return { count: 1 };
        },
      },
      order: {
        async findMany() {
          reads.orders += 1;
          return [];
        },
      },
    },
    queue: {
      async enqueue(...args: unknown[]) {
        enqueued.push(args);
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, updates, schedules, reads, enqueued };
}

describe('editing a stall', () => {
  it('lets the vendor of the stall change what the cabinet edits', async () => {
    const { svc, updates, schedules } = service();
    await runWithContext(asStallVendor, () =>
      svc.update('st1', {
        name: { ru: 'Новая лавка' },
        description: { ru: 'Свежее каждый день' },
        minOrder: 50_000,
        freeDeliveryThreshold: 300_000,
        preparationMinutes: 20,
        logoUrl: 'https://cdn.example/logo.png',
        counterPhotoUrl: 'https://cdn.example/counter.jpg',
        ownerName: 'Акмал',
        ownerSince: 2004,
        schedule: [{ weekday: 1, opensAt: 360, closesAt: 1080, closed: false }],
      }),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ minOrder: 50_000, freeDeliveryThreshold: 300_000 });
    expect(schedules).toHaveLength(1);
  });

  it('lets the desk edit and moderate any stall', async () => {
    const approval = service('PENDING_REVIEW');
    await runWithContext(asAdmin, () =>
      approval.svc.update('st1', { status: 'ACTIVE', tags: ['halal'], chainSlug: 'korzinka' }),
    );
    expect(approval.updates[0]).toMatchObject({
      status: 'ACTIVE',
      tags: ['halal'],
      chainSlug: 'korzinka',
    });

    const suspension = service('ACTIVE');
    await runWithContext(asAdmin, () => suspension.svc.update('st1', { status: 'SUSPENDED' }));
    expect(suspension.updates[0]).toMatchObject({ status: 'SUSPENDED' });
  });

  it('is refused to another stall’s vendor, a vendor-role token with no profile, and the rest', async () => {
    for (const who of [asOtherVendor, asVendorWithoutProfile, asCustomer, asOperator]) {
      const { svc, updates } = service();
      await expect(
        runWithContext(who, () => svc.update('st1', { name: { ru: 'Чужая' } })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(updates).toEqual([]);
    }
  });

  it('does not let a vendor approve their own stall or lift a suspension', async () => {
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'SUSPENDED']) {
      const { svc, updates } = service(status);
      await expect(
        runWithContext(asStallVendor, () => svc.update('st1', { status: 'ACTIVE' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        runWithContext(asStallVendor, () => svc.update('st1', { status: 'CLOSED' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(updates).toEqual([]);
    }
  });

  it('does not let a vendor suspend or send a live stall back to review', async () => {
    for (const status of ['SUSPENDED', 'PENDING_REVIEW', 'DRAFT']) {
      const { svc, updates } = service('ACTIVE');
      await expect(
        runWithContext(asStallVendor, () => svc.update('st1', { status })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(updates).toEqual([]);
    }
  });

  it('lets the vendor close and reopen a live stall', async () => {
    const closing = service('ACTIVE');
    await runWithContext(asStallVendor, () => closing.svc.update('st1', { status: 'CLOSED' }));
    expect(closing.updates[0]).toMatchObject({ status: 'CLOSED' });

    const reopening = service('CLOSED');
    await runWithContext(asStallVendor, () => reopening.svc.update('st1', { status: 'ACTIVE' }));
    expect(reopening.updates[0]).toMatchObject({ status: 'ACTIVE' });
  });

  it('lets a vendor declare the badges on their own counter, but not join a chain', async () => {
    const { svc, updates } = service();
    await expect(
      runWithContext(asStallVendor, () => svc.update('st1', { chainSlug: 'korzinka' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(updates).toEqual([]);

    await runWithContext(asStallVendor, () => svc.update('st1', { tags: ['halal'] }));
    expect(updates[0]).toMatchObject({ tags: ['halal'] });
  });

  it('takes the whole card back from the cabinet: what is already there is no change', async () => {
    const { svc, updates } = service('PENDING_REVIEW', {
      tags: ['eco', 'halal'],
      chainSlug: 'x-y',
    });
    await runWithContext(asStallVendor, () =>
      svc.update('st1', {
        status: 'PENDING_REVIEW',
        tags: ['halal', 'eco'],
        chainSlug: 'x-y',
        minOrder: 10_000,
      }),
    );
    expect(updates).toHaveLength(1);

    const plain = service();
    await runWithContext(asStallVendor, () =>
      plain.svc.update('st1', { chainSlug: null, minOrder: 10_000 }),
    );
    expect(plain.updates).toHaveLength(1);
  });
});

describe('ticking off the morning’s arrivals', () => {
  const arrivals = { productIds: ['p1'], announce: false };

  it('is the stall’s vendor’s, and the desk’s', async () => {
    for (const who of [asStallVendor, asAdmin]) {
      const { svc, reads } = service();
      await runWithContext(who, () => svc.markArrivals('st1', arrivals));
      expect(reads.products).toBe(1);
    }
  });

  it('is refused to another stall’s vendor and to a vendor-role token with no profile', async () => {
    for (const who of [asOtherVendor, asVendorWithoutProfile, asCustomer]) {
      const { svc, reads, enqueued } = service();
      await expect(
        runWithContext(who, () => svc.markArrivals('st1', { ...arrivals, announce: true })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(reads.products).toBe(0);
      expect(enqueued).toEqual([]);
    }
  });
});

describe('the stall’s report', () => {
  it('is the stall’s vendor’s, and the desk’s', async () => {
    for (const who of [asStallVendor, asAdmin]) {
      const { svc, reads } = service();
      await runWithContext(who, () => svc.report('st1'));
      expect(reads.orders).toBe(1);
    }
  });

  it('is refused to another stall’s vendor and to a vendor-role token with no profile', async () => {
    for (const who of [asOtherVendor, asVendorWithoutProfile, asCustomer]) {
      const { svc, reads } = service();
      await expect(runWithContext(who, () => svc.report('st1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(reads.orders).toBe(0);
    }
  });
});
