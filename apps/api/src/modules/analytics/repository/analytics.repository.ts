/**
 * Analytics persistence (Prisma). Tenant-scoped.
 */
import { ACTIVE_ORDER_STATUSES, DELIVERY_TIMEOUTS } from '@bazar/constants';
import { startOfLocalDay } from '@bazar/utils';
import type { OrderStatus, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { AnalyticsQuery, Granularity, TimeSeriesPoint, TopEntity } from '../types/index.js';

export class AnalyticsRepository extends BaseRepository {
  /** What people looked for — one row per query, aggregated on read. */
  async recordDemand(input: {
    tenantId: string;
    query: string;
    normalized: string;
    results: number;
    source: string;
    storeId: string | null;
    customerId: string | null;
  }): Promise<void> {
    await this.prisma.searchQuery.create({ data: input });
  }

  async demand(
    tenantId: string,
    since: Date,
    storeId: string | undefined,
  ): Promise<{ top: DemandRow[]; unmet: DemandRow[] }> {
    const where = { tenantId, createdAt: { gte: since }, ...(storeId ? { storeId } : {}) };
    const grouped = await this.prisma.searchQuery.groupBy({
      by: ['normalized'],
      where,
      _count: { _all: true },
      _max: { query: true, results: true },
      orderBy: { _count: { normalized: 'desc' } },
      take: 200,
    });
    const rows: DemandRow[] = grouped.map((row) => ({
      query: row._max.query ?? row.normalized,
      count: row._count._all,
      results: row._max.results ?? 0,
    }));
    return {
      top: rows.slice(0, 20),
      // Nothing in the catalogue answered these: what to bring tomorrow.
      unmet: rows.filter((row) => row.results === 0).slice(0, 20),
    };
  }

  private orderWhere(query: AnalyticsQuery): Prisma.OrderWhereInput {
    return {
      ...this.tenantScope(),
      ...(query.cityId !== undefined ? { addressCityId: query.cityId } : {}),
      ...(query.storeId !== undefined ? { storeId: query.storeId } : {}),
      ...(query.vendorId !== undefined ? { store: { vendorId: query.vendorId } } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            placedAt: {
              ...(query.from !== undefined ? { gte: query.from } : {}),
              ...(query.to !== undefined ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
  }

  /** Header numbers for the operator dashboard, all scoped to today. */
  async dashboard(cityId?: string) {
    const since = startOfLocalDay();
    const base = this.orderWhere({ from: since, ...(cityId !== undefined ? { cityId } : {}) });

    const [today, active, failed, delivered] = await Promise.all([
      this.prisma.order.aggregate({ where: base, _count: true, _sum: { total: true } }),
      this.prisma.order.count({
        where: { ...this.tenantScope(), status: { in: [...ACTIVE_ORDER_STATUSES] } },
      }),
      this.prisma.order.count({
        where: { ...base, status: { in: ['CANCELLED', 'FAILED'] } },
      }),
      this.prisma.order.findMany({
        where: { ...base, status: 'DELIVERED', deliveredAt: { not: null } },
        select: { placedAt: true, deliveredAt: true },
        take: 500,
      }),
    ]);

    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);
    const [couriersOnline, storesOpen] = await Promise.all([
      this.prisma.courier.count({
        where: {
          ...this.tenantScope(),
          status: 'ONLINE',
          lastLocationAt: { gte: staleBefore },
          ...(cityId !== undefined ? { cityId } : {}),
        },
      }),
      this.prisma.store.count({
        where: {
          ...this.tenantScope(),
          status: 'ACTIVE',
          deletedAt: null,
          ...(cityId !== undefined ? { cityId } : {}),
        },
      }),
    ]);

    // Median, not mean: one order stuck behind a closed bazaar gate would drag
    // an average into uselessness.
    const durations = delivered
      .map((order) => (order.deliveredAt as Date).getTime() - order.placedAt.getTime())
      .sort((a, b) => a - b);
    const middle = durations[Math.floor(durations.length / 2)];

    return {
      ordersToday: today._count,
      revenueToday: today._sum.total ?? 0,
      ordersActive: active,
      failedToday: failed,
      couriersOnline,
      storesOpen,
      medianDeliverySeconds: middle === undefined ? null : Math.round(middle / 1000),
    };
  }

  async salesTotals(query: AnalyticsQuery) {
    const where = this.orderWhere(query);

    const [totals, byStatus] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...where, status: 'DELIVERED' },
        _count: true,
        _sum: { total: true, subtotal: true, deliveryFee: true, discount: true },
      }),
      this.prisma.order.groupBy({ by: ['status'], where, _count: true }),
    ]);

    return {
      orders: totals._count,
      revenue: totals._sum.total ?? 0,
      subtotal: totals._sum.subtotal ?? 0,
      deliveryFees: totals._sum.deliveryFee ?? 0,
      discounts: totals._sum.discount ?? 0,
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count])) as Partial<
        Record<OrderStatus, number>
      >,
    };
  }

  /**
   * Bucketed revenue over time. Raw SQL with date_trunc: Prisma cannot group
   * by a derived time bucket, and doing it in application code would mean
   * pulling every order of the period into memory.
   */
  async series(query: AnalyticsQuery, granularity: Granularity): Promise<TimeSeriesPoint[]> {
    const from = query.from ?? new Date(Date.now() - 30 * 86400 * 1000);
    const to = query.to ?? new Date();
    const tenantId = this.tenantScope().tenantId;

    const rows = await this.prisma.$queryRaw<{ bucket: Date; value: bigint }[]>`
      SELECT date_trunc(${granularity}, "placedAt" AT TIME ZONE 'Asia/Tashkent') AS bucket,
             COALESCE(SUM("total"), 0)::bigint AS value
      FROM "orders"
      WHERE "tenantId" = ${tenantId}
        AND "placedAt" BETWEEN ${from} AND ${to}
        AND "status" = 'DELIVERED'
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    return rows.map((row) => ({ at: row.bucket.toISOString(), value: Number(row.value) }));
  }

  async topStores(query: AnalyticsQuery, limit = 10): Promise<TopEntity[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['storeId'],
      where: { ...this.orderWhere(query), status: 'DELIVERED' },
      _count: true,
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    return grouped.map((row) => ({
      id: row.storeId,
      orders: row._count,
      revenue: row._sum.total ?? 0,
    }));
  }

  async courierPerformance(query: AnalyticsQuery, limit = 20) {
    const grouped = await this.prisma.delivery.groupBy({
      by: ['courierId'],
      where: {
        ...this.tenantScope(),
        status: 'DELIVERED',
        ...(query.from !== undefined ? { deliveredAt: { gte: query.from } } : {}),
      },
      _count: true,
      _sum: { payout: true },
      orderBy: { _count: { courierId: 'desc' } },
      take: limit,
    });

    return grouped
      .filter((row) => row.courierId !== null)
      .map((row) => ({
        courierId: row.courierId as string,
        deliveries: row._count,
        earnings: row._sum.payout ?? 0,
      }));
  }
}

export interface DemandRow {
  query: string;
  count: number;
  results: number;
}
