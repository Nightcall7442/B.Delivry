/**
 * Start-up recovery for courier searches that never began.
 */
import { SEARCH_RADIUS } from '@bazar/constants';
import type { Container } from '../app/container.js';
import { JOB, QUEUE, type FindCourierJob } from './queues.js';

/** An order confirmed longer ago than this is the desk's to look at, not ours to revive. */
const RECENT_HOURS = 3;
/** The courier reaches the stall this long before a slot window opens (as the confirm handler does). */
const SLOT_LEAD_MINUTES = 45;

/**
 * The courier search is a queued job that opens the delivery. If it was never queued (the queue had
 * no runner, an id was refused) or was lost with a restart, the order sits in CONFIRMED with no
 * delivery at all: no courier hears of it and the desk has no button to move it. Queue the search
 * again for such recent orders; the job id is the confirm handler's own, so an order that already has
 * its job in the queue is not searched twice.
 */
export async function requeueStalledSearches(container: Container): Promise<number> {
  const now = Date.now();
  const stalled = await container.prisma.order.findMany({
    where: {
      status: 'CONFIRMED',
      delivery: null,
      confirmedAt: { gte: new Date(now - RECENT_HOURS * 3600_000) },
    },
    select: { id: true, tenantId: true, scheduledFor: true },
  });

  for (const order of stalled) {
    const payload: FindCourierJob = {
      tenantId: order.tenantId,
      orderId: order.id,
      radiusMeters: SEARCH_RADIUS.COURIER_INITIAL_METERS,
      attempt: 1,
    };
    const startIn =
      order.scheduledFor === null
        ? 0
        : order.scheduledFor.getTime() - SLOT_LEAD_MINUTES * 60_000 - now;
    await container.queue.enqueue(QUEUE.DELIVERY, JOB.FIND_COURIER, payload, {
      jobId: `find-courier:${order.id}`,
      ...(startIn > 0 ? { delayMs: startIn } : {}),
    });
  }

  if (stalled.length > 0) {
    container.logger.warn(
      { orders: stalled.map((order) => order.id) },
      'courier search re-queued for confirmed orders that had none',
    );
  }
  return stalled.length;
}
