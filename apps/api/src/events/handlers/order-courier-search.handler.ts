/**
 * OrderConfirmed → enqueue find-courier job.
 */
import { SEARCH_RADIUS, isTerminalOrderStatus } from '@bazar/constants';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import { JOB, QUEUE, type FindCourierJob } from '../../jobs/queues.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import type { DeliveryService } from '../../modules/delivery/service/delivery.service.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import type { OrdersService } from '../../modules/orders/service/orders.service.js';
import type { EventBus } from '../event-bus.js';

/** How long before a delivery window the search starts. */
const SLOT_LEAD_MINUTES = 45;

export interface CourierSearchDeps {
  queue: JobQueue;
  /** Off for tenants that dispatch by hand from the operator panel. */
  autoAssign: (tenantId: string) => Promise<boolean>;
  orders: OrdersService;
  delivery: DeliveryService;
}

/**
 * Confirming an order starts the hunt for a courier. It is a job rather than a
 * direct call because the search takes minutes, widens its radius and retries,
 * none of which belongs inside the HTTP request that confirmed the order.
 */
export function registerCourierSearchHandlers(events: EventBus, deps: CourierSearchDeps): void {
  events.on(ORDER_EVENT.CONFIRMED, async (event) => {
    if (!(await deps.autoAssign(event.tenantId))) return;

    // Cross-bazaar: only the group's first order searches; the others take its
    // courier — now if it already has one, otherwise the moment it is assigned.
    // A leader that died (cancelled, failed) leaves each follower to search alone.
    const joined = await runWithContext(
      systemContext(event.tenantId, `group:${event.id}`, 'uz'),
      async () => {
        const order = await deps.orders.get(event.payload.orderId);
        if (order.groupId === null) return false;
        const [leader] = await deps.orders.group(order.groupId);
        if (
          leader === undefined ||
          leader.id === order.id ||
          isTerminalOrderStatus(leader.status)
        ) {
          return false;
        }
        if (leader.courierId !== null)
          await deps.delivery.assignSibling(order.id, leader.courierId);
        return true;
      },
    );
    if (joined) return;

    const payload: FindCourierJob = {
      tenantId: event.tenantId,
      orderId: event.payload.orderId,
      // Plus: skip the first narrow round, so twice the couriers hear about it at once.
      radiusMeters: SEARCH_RADIUS.COURIER_INITIAL_METERS * (event.payload.priority ? 2 : 1),
      attempt: 1,
    };

    // A slot order waits: the courier should reach the stall shortly before
    // the window opens, not the moment the vendor confirmed it the night before.
    const startAt =
      event.payload.scheduledFor === null
        ? 0
        : Date.parse(event.payload.scheduledFor) - SLOT_LEAD_MINUTES * 60_000 - Date.now();

    await deps.queue.enqueue(QUEUE.DELIVERY, JOB.FIND_COURIER, payload, {
      // One search per order, however many times the event is replayed.
      jobId: `find-courier:${event.payload.orderId}`,
      ...(startAt > 0 ? { delayMs: startAt } : {}),
    });
  });

  // A courier who abandons the job puts the order back on the market, starting
  // again from the initial radius: the pickup point has not moved, but the
  // couriers around it have.
  events.on(DELIVERY_EVENT.COURIER_RELEASED, async (event) => {
    const payload: FindCourierJob = {
      tenantId: event.tenantId,
      orderId: event.payload.orderId,
      radiusMeters: SEARCH_RADIUS.COURIER_INITIAL_METERS,
      attempt: 1,
    };

    await deps.queue.enqueue(QUEUE.DELIVERY, JOB.FIND_COURIER, payload, {
      jobId: `find-courier:${event.payload.orderId}:${event.id}`,
    });
  });
}
