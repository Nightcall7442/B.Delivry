/**
 * Operator monitoring streams (city-wide active orders/couriers).
 */
import type { Connection, WebsocketGateway } from '../gateway.js';
import { room } from '../rooms.js';

/**
 * One room per city rather than per order: an operator watches everything
 * moving in Tashkent, and subscribing to hundreds of order rooms would mean
 * hundreds of membership entries per dashboard.
 */
export async function joinOperatorRoom(
  connection: Connection,
  cityId: string,
  gateway: WebsocketGateway,
): Promise<boolean> {
  return gateway.requestJoin(connection, room.operator(cityId));
}
