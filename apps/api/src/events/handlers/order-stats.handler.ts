/**
 * Delivered/failed → the counters on the courier and the customer.
 */
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { CouriersService } from '../../modules/couriers/service/couriers.service.js';
import type { CustomersService } from '../../modules/customers/service/customers.service.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import type { EventBus } from '../event-bus.js';

export interface StatsDeps {
  couriers: CouriersService;
  customers: CustomersService;
}

/**
 * Counters are derived data: nothing here may fail the delivery that caused
 * it, so the work runs as the platform after the fact, not inside the
 * courier's request.
 */
export function registerOrderStatsHandlers(events: EventBus, deps: StatsDeps): void {
  events.on(DELIVERY_EVENT.DELIVERED, async (event) => {
    const { courierId, payout, orderId, customerId, orderTotal } = event.payload;
    await runWithContext(systemContext(event.tenantId, `stats:${event.id}`, 'uz'), async () => {
      await deps.couriers.recordCompletion(courierId, payout, orderId);
      await deps.customers.recordDelivered(customerId, orderTotal);
    });
  });

  events.on(DELIVERY_EVENT.FAILED, async (event) => {
    const { courierId } = event.payload;
    if (courierId === null) return;
    await runWithContext(systemContext(event.tenantId, `stats:${event.id}`, 'uz'), () =>
      deps.couriers.recordCancellation(courierId),
    );
  });
}
