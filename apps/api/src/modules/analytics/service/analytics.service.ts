/**
 * Analytics business logic. Dashboard stats, sales reports, courier performance.
 */
import { PERMISSION } from '@bazar/constants';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { cached, type CacheStore } from '../../../infrastructure/redis/cache.js';
import type { AnalyticsRepository } from '../repository/analytics.repository.js';
import type { AnalyticsQuery, DashboardStats, Granularity, SalesReport } from '../types/index.js';

/**
 * Dashboards are refreshed constantly by every open admin tab, and the numbers
 * do not need to be to the second. A short cache turns a wall of dashboards
 * into one query a minute.
 */
const DASHBOARD_TTL_SECONDS = 60;
const REPORT_TTL_SECONDS = 300;

export interface AnalyticsServiceDeps extends ServiceDeps {
  repository: AnalyticsRepository;
  cache: CacheStore;
}

export class AnalyticsService extends BaseService {
  /** Fire-and-forget from search and the shopping-list parser; never fails a request. */
  async recordDemand(input: {
    query: string;
    results: number;
    source: 'search' | 'list';
    storeId?: string | undefined;
  }): Promise<void> {
    const normalized = normalizeDemand(input.query);
    if (normalized.length < 2) return;
    const user = this.context().user;
    await this.repository
      .recordDemand({
        tenantId: this.tenantId(),
        query: input.query.trim().slice(0, 120),
        normalized,
        results: input.results,
        source: input.source,
        storeId: input.storeId ?? null,
        customerId: user?.customerId ?? null,
      })
      .catch((error: unknown) => this.logger.warn({ err: error }, 'demand not recorded'));
  }

  /** Top queries and the ones the catalogue could not answer, last `days` days. */
  async demand(input: { days: number; storeId?: string | undefined }) {
    this.authorize(PERMISSION.ANALYTICS_READ);
    const since = new Date(Date.now() - input.days * 86_400_000);
    return this.repository.demand(this.tenantId(), since, input.storeId);
  }

  private readonly repository: AnalyticsRepository;
  private readonly cache: CacheStore;

  constructor(deps: AnalyticsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.cache = deps.cache;
  }

  async dashboard(cityId?: string): Promise<DashboardStats> {
    this.authorize(PERMISSION.ANALYTICS_READ);

    return cached(
      this.cache,
      `dashboard:${this.tenantId()}:${cityId ?? 'all'}`,
      DASHBOARD_TTL_SECONDS,
      async () => {
        const raw = await this.repository.dashboard(cityId);

        return {
          ordersToday: raw.ordersToday,
          ordersActive: raw.ordersActive,
          revenueToday: raw.revenueToday,
          averageOrderValue:
            raw.ordersToday === 0 ? 0 : Math.round(raw.revenueToday / raw.ordersToday),
          couriersOnline: raw.couriersOnline,
          storesOpen: raw.storesOpen,
          failureRate: raw.ordersToday === 0 ? 0 : raw.failedToday / raw.ordersToday,
          medianDeliverySeconds: raw.medianDeliverySeconds,
          currency: 'UZS',
        };
      },
      ['analytics'],
    );
  }

  async sales(input: AnalyticsQuery): Promise<SalesReport> {
    this.authorize(PERMISSION.ANALYTICS_READ);
    // A vendor's report is their own stalls, whatever the query says.
    const vendorId = this.currentUser().vendorId;
    const query: AnalyticsQuery = vendorId !== undefined ? { ...input, vendorId } : input;

    const granularity: Granularity = query.granularity ?? 'day';
    const from = query.from ?? new Date(Date.now() - 30 * 86400 * 1000);
    const to = query.to ?? new Date();

    const key = `sales:${this.tenantId()}:${from.toISOString()}:${to.toISOString()}:${granularity}:${query.cityId ?? ''}:${query.storeId ?? ''}:${query.vendorId ?? ''}`;

    return cached(
      this.cache,
      key,
      REPORT_TTL_SECONDS,
      async () => {
        const [totals, series] = await Promise.all([
          this.repository.salesTotals({ ...query, from, to }),
          this.repository.series({ ...query, from, to }, granularity),
        ]);

        return {
          from,
          to,
          orders: totals.orders,
          revenue: totals.revenue,
          // What the platform kept: fees plus the take on the goods.
          commission: totals.revenue - totals.subtotal + totals.deliveryFees,
          deliveryFees: totals.deliveryFees,
          discounts: totals.discounts,
          byStatus: totals.byStatus,
          series,
          currency: 'UZS',
        };
      },
      ['analytics'],
    );
  }

  async topStores(query: AnalyticsQuery, limit?: number) {
    this.authorize(PERMISSION.ANALYTICS_READ);
    return this.repository.topStores(query, limit);
  }

  async courierPerformance(query: AnalyticsQuery, limit?: number) {
    this.authorize(PERMISSION.ANALYTICS_READ);
    return this.repository.courierPerformance(query, limit);
  }

  /** Called by the nightly job so the next morning's dashboard is warm. */
  async invalidate(): Promise<void> {
    await this.cache.invalidateByTag('analytics');
  }
}

/** Lower-case, apostrophes and punctuation out, spaces squeezed: the grouping key. */
export const normalizeDemand = (query: string): string =>
  query
    .toLowerCase()
    .replace(/[ʻʼ'’`ʹ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
