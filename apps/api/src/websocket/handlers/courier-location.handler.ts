/**
 * Courier location ingest → tracking module → broadcast to order room.
 */
import type { TrackingService } from '../../modules/tracking/index.js';
import type { Connection, WebsocketGateway } from '../gateway.js';
import type { LocationCommand } from '../events.js';

export interface LocationHandlerDeps {
  gateway: WebsocketGateway;
  tracking: TrackingService;
}

/**
 * The hot path of the whole platform: a courier phone sends a fix every few
 * seconds, and it has to reach the customer's map quickly. The tracking
 * service does the validation (the order must be this courier's), the thinning
 * and the broadcast; this only rate-limits and hands over inside the socket's
 * request context.
 */
export async function handleLocation(
  connection: Connection,
  command: LocationCommand,
  deps: LocationHandlerDeps,
): Promise<void> {
  // Only a courier account has a position worth recording.
  if (connection.user.courierId === undefined) return;
  // A phone reports every few seconds; a faster stream is a script, and every fix costs a database
  // write and a pubsub message. Dropping the excess loses nothing the next fix does not repeat.
  if (!deps.gateway.allowLocation(connection)) return;

  await deps.gateway.runAs(connection, () =>
    deps.tracking.push([
      {
        lat: command.lat,
        lng: command.lng,
        heading: command.heading,
        speedKmh: command.speedKmh,
        accuracyMeters: command.accuracyMeters,
        // The device clock is what orders the pings; a missing one means now. The service decides
        // what to do with one that is unreadable or far from the server's.
        recordedAt: command.recordedAt === undefined ? new Date() : new Date(command.recordedAt),
        orderId: command.orderId,
      },
    ]),
  );
}
