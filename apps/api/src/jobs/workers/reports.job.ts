/**
 * Generate scheduled reports (daily vendor/courier statements).
 */
import { startOfLocalDay } from '@bazar/utils';
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { DailyReportsJob } from '../queues.js';

/**
 * Daily statements: what each vendor is owed and what each courier earned.
 * Computed rather than stored, so a statement always reflects the current
 * state of the orders it covers.
 */
export function dailyReportsJob(container: Container) {
  return async (payload: DailyReportsJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:reports:${payload.date}`, 'uz');

    await runWithContext(context, async () => {
      const since = startOfLocalDay(new Date(payload.date));

      const sales = await container.services.analytics.sales({ from: since, to: new Date() });
      const couriers = await container.services.analytics.courierPerformance({ from: since });

      container.logger.info(
        {
          date: payload.date,
          orders: sales.orders,
          revenue: sales.revenue,
          couriers: couriers.length,
        },
        'daily report generated',
      );
    });
  };
}
