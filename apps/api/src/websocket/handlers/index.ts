/**
 * Handlers registry.
 */
import type { TrackingService } from '../../modules/tracking/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { parseCommand, WS_COMMAND } from '../events.js';
import type { Connection, WebsocketGateway } from '../gateway.js';
import { handleLocation } from './courier-location.handler.js';

export interface HandlerDeps {
  gateway: WebsocketGateway;
  tracking: TrackingService;
  logger: Logger;
}

/**
 * The one place an inbound socket message is interpreted. Anything unparsable
 * or unknown is answered with an error frame and dropped: a websocket is an
 * unauthenticated-shaped input surface even after the handshake, so nothing
 * here trusts the payload.
 */
export async function handleMessage(
  connection: Connection,
  raw: string,
  deps: HandlerDeps,
): Promise<void> {
  const command = parseCommand(raw);

  if (command === null) {
    send(connection, { event: 'error', data: { message: 'Unrecognised command' } });
    return;
  }

  connection.lastSeenAt = Date.now();

  switch (command.action) {
    case WS_COMMAND.PING:
      send(connection, { event: 'pong', data: { at: new Date().toISOString() } });
      return;

    case WS_COMMAND.JOIN: {
      const joined = await deps.gateway.requestJoin(connection, command.room);
      send(connection, {
        event: joined ? 'joined' : 'error',
        data: joined ? { room: command.room } : { message: `Cannot join ${command.room}` },
      });
      return;
    }

    case WS_COMMAND.LEAVE:
      deps.gateway.leave(connection, command.room);
      send(connection, { event: 'left', data: { room: command.room } });
      return;

    case WS_COMMAND.LOCATION:
      await handleLocation(connection, command, deps);
      return;

    default:
      deps.logger.debug({ command }, 'unhandled websocket command');
  }
}

function send(connection: Connection, message: { event: string; data: unknown }): void {
  if (connection.socket.readyState !== 1) return;
  connection.socket.send(JSON.stringify({ ...message, at: new Date().toISOString() }));
}

export { handleLocation };
export { joinOrderRoom, leaveOrderRoom } from './order.handler.js';
export { joinStoreRoom } from './store.handler.js';
export { joinOperatorRoom } from './operator.handler.js';
export { notificationRoomFor } from './notification.handler.js';
