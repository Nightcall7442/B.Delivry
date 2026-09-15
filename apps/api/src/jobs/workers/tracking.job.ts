/**
 * Persist/aggregate courier location batches.
 */
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { PersistLocationsJob } from '../queues.js';

/**
 * Overflow path for location writes. Normal pings go straight through the
 * websocket handler, but a courier app that was offline in a bazaar basement
 * comes back with a backlog, and that backlog is queued so it cannot stall the
 * live traffic behind it.
 */
export function persistLocationsJob(container: Container) {
  return async (payload: PersistLocationsJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:locations:${payload.courierId}`, 'uz');

    await runWithContext(context, async () => {
      await container.services.tracking.push(
        payload.points.map((point) => ({
          lat: point.lat,
          lng: point.lng,
          heading: point.heading,
          speedKmh: point.speedKmh,
          accuracyMeters: point.accuracyMeters,
          recordedAt: new Date(point.recordedAt),
          orderId: point.orderId,
        })),
      );
    });
  };
}
