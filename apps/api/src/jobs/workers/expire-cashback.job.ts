/**
 * Nightly: cashback older than its life burns.
 */
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { Container } from '../../app/container.js';
import type { ExpireCashbackJob } from '../queues.js';

export function expireCashbackJob(container: Container) {
  return async (payload: ExpireCashbackJob): Promise<void> => {
    const expired = await runWithContext(
      systemContext(payload.tenantId, `cashback:${Date.now()}`, 'uz'),
      () => container.services.payments.expireCashback(),
    );
    if (expired > 0) container.logger.info({ expired }, 'cashback expired');
  };
}
