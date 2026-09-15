/**
 * Search & offer order to couriers (retries, timeout, fallback to operator).
 */
import { DELIVERY_TIMEOUTS, ORDER_STATUS } from '@bazar/constants';
import type { Container } from '../../app/container.js';
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { JOB, QUEUE, type FindCourierJob } from '../queues.js';
import { courierSearchDuration } from '../../infrastructure/telemetry/metrics.js';

/**
 * One attempt per job run. If nobody accepts before the offer expires, the job
 * re-enqueues itself with a wider radius rather than looping in place: a
 * worker holding a connection for ten minutes is a worker doing nothing.
 *
 * Gives up once the radius passes the maximum, and hands the order to an
 * operator through the search-exhausted event.
 */
export function findCourierJob(container: Container) {
  return async (payload: FindCourierJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:find-courier:${payload.orderId}`, 'uz');

    await runWithContext(context, async () => {
      const { delivery, orders, queue, logger } = {
        delivery: container.services.delivery,
        orders: container.services.orders,
        queue: container.queue,
        logger: container.logger,
      };

      const order = await orders.get(payload.orderId);

      // The order moved on while this job was queued: a courier accepted, or
      // it was cancelled. Either way there is nothing to search for.
      if (
        order.status !== ORDER_STATUS.SEARCHING_COURIER &&
        order.status !== ORDER_STATUS.CONFIRMED
      ) {
        logger.debug({ orderId: payload.orderId, status: order.status }, 'search no longer needed');
        return;
      }

      // Idempotent: the first attempt opens the delivery, retries reuse it.
      await delivery.createForOrder(payload.orderId);

      const started = Date.now();
      const offered = await delivery.runSearch(payload.orderId, payload.radiusMeters);

      if (offered.length > 0) {
        courierSearchDuration.observe((Date.now() - started) / 1000);
      }
      logger.info(
        { orderId: payload.orderId, radiusMeters: payload.radiusMeters, offered: offered.length },
        'courier search round',
      );

      const nextRadius = delivery.nextRadius(payload.radiusMeters);

      if (nextRadius === null) {
        await delivery.exhausted(payload.orderId, payload.attempt, payload.radiusMeters);
        return;
      }

      // Retry after the offers expire, so the next round does not compete with
      // couriers still looking at the current one.
      const next: FindCourierJob = {
        ...payload,
        radiusMeters: offered.length > 0 ? payload.radiusMeters : nextRadius,
        attempt: payload.attempt + 1,
      };

      await queue.enqueue(QUEUE.DELIVERY, JOB.FIND_COURIER, next, {
        delayMs: DELIVERY_TIMEOUTS.OFFER_TTL_SECONDS * 1000,
        jobId: `find-courier:${payload.orderId}:${next.attempt}`,
      });
    });
  };
}
