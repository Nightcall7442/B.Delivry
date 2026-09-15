/**
 * In-app realtime notifications.
 */
import type { Connection } from '../gateway.js';

/**
 * Nothing to register: every socket is already in its own `user:{id}` room
 * from the moment it connects, and the notifications service publishes there.
 * This file exists so that fact is written down somewhere findable.
 */
export function notificationRoomFor(connection: Connection): string {
  return `user:${connection.user.id}`;
}
