/**
 * `analytics:read` is held by every vendor, and the routes asked for nothing more — so a vendor
 * could read the whole bazaar's dashboard, every stall's takings and every courier's earnings, and
 * a vendor-role token without a vendorId got an unscoped sales report. The desk is whoever may read
 * every order (`order:read_any`); a missing vendorId is never that.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { MemoryCache } from '../../src/infrastructure/redis/cache.js';
import { AnalyticsRepository } from '../../src/modules/analytics/repository/analytics.repository.js';
import { AnalyticsService } from '../../src/modules/analytics/service/analytics.service.js';
import type { AnalyticsQuery } from '../../src/modules/analytics/types/index.js';

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
const asStallVendor = as(['VENDOR'], { vendorId: STALL_VENDOR });
const asOtherVendor = as(['VENDOR'], { vendorId: 'vendor-other' });
/** Holds the vendor role but no vendor profile rides on the token. */
const asVendorWithoutProfile = as(['VENDOR']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
const asJob = systemContext('t1', 'job:reports', 'uz');

function service() {
  const seen = {
    totals: [] as AnalyticsQuery[],
    series: [] as AnalyticsQuery[],
    topStores: 0,
    couriers: 0,
    dashboard: 0,
    demand: [] as (string | undefined)[],
  };
  const stores: Record<string, { vendorId: string; tenantId: string }> = {
    'st-stall': { vendorId: STALL_VENDOR, tenantId: 't1' },
    'st-other': { vendorId: 'vendor-other', tenantId: 't1' },
  };
  const repository = {
    async salesTotals(query: AnalyticsQuery) {
      seen.totals.push(query);
      return { orders: 0, revenue: 0, subtotal: 0, deliveryFees: 0, discounts: 0, byStatus: {} };
    },
    async series(query: AnalyticsQuery) {
      seen.series.push(query);
      return [];
    },
    async topStores() {
      seen.topStores += 1;
      return [];
    },
    async courierPerformance() {
      seen.couriers += 1;
      return [];
    },
    async dashboard() {
      seen.dashboard += 1;
      return {
        ordersToday: 0,
        ordersActive: 0,
        revenueToday: 0,
        failedToday: 0,
        couriersOnline: 0,
        storesOpen: 0,
        medianDeliverySeconds: null,
      };
    },
    async demand(_tenantId: string, _since: Date, storeId: string | undefined) {
      seen.demand.push(storeId);
      return { top: [], unmet: [] };
    },
    async storeOwner(id: string) {
      return stores[id] ?? null;
    },
  };
  const svc = new AnalyticsService({
    repository,
    cache: new MemoryCache(),
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, seen };
}

describe('the numbers of the whole bazaar', () => {
  it('are the desk’s: the dashboard, the top stores and the couriers', async () => {
    for (const who of [asAdmin, asOperator]) {
      const { svc, seen } = service();
      await runWithContext(who, () => svc.dashboard());
      await runWithContext(who, () => svc.topStores({}));
      await runWithContext(who, () => svc.courierPerformance({}));
      expect(seen).toMatchObject({ dashboard: 1, topStores: 1, couriers: 1 });
    }
  });

  it('are refused to a vendor, with or without a vendor profile, and to a customer', async () => {
    for (const who of [asStallVendor, asVendorWithoutProfile, asCustomer]) {
      const { svc, seen } = service();
      await expect(runWithContext(who, () => svc.dashboard())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(who, () => svc.topStores({}))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(who, () => svc.courierPerformance({}))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(seen).toMatchObject({ dashboard: 0, topStores: 0, couriers: 0 });
    }
  });

  it('are still computed for the nightly job, which acts as the platform', async () => {
    const { svc, seen } = service();
    await runWithContext(asJob, () => svc.courierPerformance({}));
    expect(seen.couriers).toBe(1);
  });
});

describe('a sales report', () => {
  it('is forced to the vendor’s own stalls, whatever the query says', async () => {
    const { svc, seen } = service();
    await runWithContext(asStallVendor, () =>
      svc.sales({ storeId: 'st-other', vendorId: 'vendor-other' }),
    );
    expect(seen.totals[0]?.vendorId).toBe(STALL_VENDOR);
    expect(seen.series[0]?.vendorId).toBe(STALL_VENDOR);
  });

  it('is refused to a vendor-role token with no vendor profile, never read as the desk', async () => {
    const { svc, seen } = service();
    await expect(
      runWithContext(asVendorWithoutProfile, () => svc.sales({})),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(seen.totals).toEqual([]);
    expect(seen.series).toEqual([]);
  });

  it('covers the whole bazaar, or the stall it is asked for, for the desk', async () => {
    for (const who of [asAdmin, asOperator]) {
      const { svc, seen } = service();
      await runWithContext(who, () => svc.sales({}));
      await runWithContext(who, () => svc.sales({ storeId: 'st-other' }));
      expect(seen.totals.map((query) => query.vendorId)).toEqual([undefined, undefined]);
      expect(seen.totals[1]?.storeId).toBe('st-other');
    }
  });

  it('is still generated for the nightly job, unscoped', async () => {
    const { svc, seen } = service();
    await runWithContext(asJob, () => svc.sales({}));
    expect(seen.totals).toHaveLength(1);
    expect(seen.totals[0]?.vendorId).toBeUndefined();
  });
});

describe('what people searched for', () => {
  it('is open to every vendor across the bazaar', async () => {
    const { svc, seen } = service();
    await runWithContext(asStallVendor, () => svc.demand({ days: 30 }));
    await runWithContext(asVendorWithoutProfile, () => svc.demand({ days: 30 }));
    expect(seen.demand).toEqual([undefined, undefined]);
  });

  it('inside one stall is that stall’s: its vendor and the desk, nobody else', async () => {
    for (const who of [asStallVendor, asAdmin, asOperator]) {
      const { svc, seen } = service();
      await runWithContext(who, () => svc.demand({ days: 30, storeId: 'st-stall' }));
      expect(seen.demand).toEqual(['st-stall']);
    }
    for (const who of [asOtherVendor, asVendorWithoutProfile]) {
      const { svc, seen } = service();
      await expect(
        runWithContext(who, () => svc.demand({ days: 30, storeId: 'st-stall' })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(seen.demand).toEqual([]);
    }
  });

  it('for a stall that does not exist is a 404 to a vendor', async () => {
    const { svc } = service();
    await expect(
      runWithContext(asStallVendor, () => svc.demand({ days: 30, storeId: 'st-nowhere' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('the sales chart', () => {
  /** A Prisma stand-in that keeps the raw query: tagged template (old) or Prisma.sql (new). */
  function raw() {
    const captured: { text: string; values: unknown[] }[] = [];
    const prisma = {
      async $queryRaw(
        first: TemplateStringsArray | { sql: string; values: unknown[] },
        ...rest: unknown[]
      ) {
        captured.push(
          Array.isArray(first)
            ? { text: (first as TemplateStringsArray).join('?'), values: rest }
            : {
                text: (first as { sql: string }).sql,
                values: (first as { values: unknown[] }).values,
              },
        );
        return [];
      },
    };
    return { repository: new AnalyticsRepository(prisma as never), captured };
  }
  const from = new Date('2026-09-01T00:00:00Z');
  const to = new Date('2026-09-30T00:00:00Z');

  it('is narrowed to the vendor’s stalls like the totals are, not just to the tenant', async () => {
    const { repository, captured } = raw();
    await runWithContext(asStallVendor, () =>
      repository.series({ from, to, vendorId: STALL_VENDOR }, 'day'),
    );
    expect(captured[0]?.values).toContain(STALL_VENDOR);
    expect(captured[0]?.text).toContain('"vendorId"');
  });

  it('honours the store and city filters too', async () => {
    const { repository, captured } = raw();
    await runWithContext(asAdmin, () =>
      repository.series({ from, to, storeId: 'st-stall', cityId: 'city-1' }, 'week'),
    );
    expect(captured[0]?.values).toEqual(['week', 't1', from, to, 'city-1', 'st-stall']);
  });

  it('is the tenant’s whole bazaar when nothing narrows it', async () => {
    const { repository, captured } = raw();
    await runWithContext(asAdmin, () => repository.series({ from, to }, 'day'));
    expect(captured[0]?.values).toEqual(['day', 't1', from, to]);
  });
});
