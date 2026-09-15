/**
 * Aggregate analytics snapshots.
 */
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { AnalyticsSnapshotJob } from '../queues.js';

/**
 * Runs after midnight local time and drops the cached dashboards, so the first
 * operator in the morning sees yesterday closed out rather than a stale
 * five-minute-old report.
 */
export function analyticsSnapshotJob(container: Container) {
  return async (payload: AnalyticsSnapshotJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:analytics:${payload.date}`, 'uz');

    await runWithContext(context, async () => {
      await container.services.analytics.invalidate();
      container.logger.info({ date: payload.date }, 'analytics caches refreshed');
    });
  };
}
