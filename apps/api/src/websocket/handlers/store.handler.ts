/**
 * Store: new order alerts, preparation status.
 */
import type { Connection, WebsocketGateway } from '../gateway.js';
import { room } from '../rooms.js';

/**
 * A stall keeps a tablet open on this room and hears about a new order the
 * moment it is placed, which is what makes the preparation window real.
 */
export async function joinStoreRoom(
  connection: Connection,
  storeId: string,
  gateway: WebsocketGateway,
): Promise<boolean> {
  return gateway.requestJoin(connection, room.store(storeId));
}
