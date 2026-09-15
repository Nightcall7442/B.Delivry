/**
 * Recalculate ETA for active deliveries.
 */
import { ACTIVE_ORDER_STATUSES, ORDER_STATUS } from '@bazar/constants';
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { UpdateEtaJob } from '../queues.js';

/** ETA only means something once a courier is actually carrying the order. */
const ETA_RELEVANT: readonly string[] = [
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.COURIER_ASSIGNED,
];

export function updateEtaJob(container: Container) {
  return async (payload: UpdateEtaJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:eta:${payload.orderId}`, 'uz');

    await runWithContext(context, async () => {
      const order = await container.services.orders.get(payload.orderId);

      // Stop recomputing for an order that has arrived or been cancelled.
      if (!ACTIVE_ORDER_STATUSES.includes(order.status)) return;
      if (!ETA_RELEVANT.includes(order.status)) return;

      await container.services.tracking.refreshEta(payload.orderId);
    });
  };
}
