/**
 * Order status live updates.
 */
import type { Connection, WebsocketGateway } from '../gateway.js';
import { room } from '../rooms.js';

/**
 * Joining an order room is the only place a client asks for data it does not
 * already own, so the ownership check in the gateway is what protects it.
 * Everything after the join is push-only.
 */
export async function joinOrderRoom(
  connection: Connection,
  orderId: string,
  gateway: WebsocketGateway,
): Promise<boolean> {
  return gateway.requestJoin(connection, room.order(orderId));
}

export function leaveOrderRoom(
  connection: Connection,
  orderId: string,
  gateway: WebsocketGateway,
): void {
  gateway.leave(connection, room.order(orderId));
}
