/**
 * Hourly: a sale left alone for the reference week loses its struck price (ProductsService).
 */
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { Container } from '../../app/container.js';
import type { EndStaleSalesJob } from '../queues.js';

export function endStaleSalesJob(container: Container) {
  return async (payload: EndStaleSalesJob): Promise<void> => {
    const ended = await runWithContext(
      systemContext(payload.tenantId, `stale-sales:${Date.now()}`, 'uz'),
      () => container.services.products.endStaleSales(),
    );
    if (ended > 0) container.logger.info({ ended }, 'stale sales ended');
  };
}
