/**
 * Every few minutes: place the orders of subscriptions whose window is near.
 */
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { Container } from '../../app/container.js';
import type { RunSubscriptionsJob } from '../queues.js';

export function runSubscriptionsJob(container: Container) {
  return async (payload: RunSubscriptionsJob): Promise<void> => {
    const placed = await runWithContext(
      systemContext(payload.tenantId, `subscriptions:${Date.now()}`, 'uz'),
      () => container.services.subscriptions.runDue(),
    );
    if (placed > 0) container.logger.info({ placed }, 'subscription orders placed');
  };
}
