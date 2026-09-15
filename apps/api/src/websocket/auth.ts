/**
 * WS connection authentication (JWT) & authorization for room joins.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { PERMISSION } from '@bazar/constants';
import { can } from '@bazar/auth';
import type { TokenVerifier } from '../middleware/auth.middleware.js';
import { parseRoom } from './rooms.js';

/**
 * Browsers cannot set headers on a websocket handshake, so the token arrives
 * as a query parameter. That means it can end up in access logs, which is why
 * these tokens are short-lived access tokens and never refresh tokens.
 */
export async function authenticateSocket(
  url: string,
  verifier: TokenVerifier,
): Promise<AuthenticatedUser | null> {
  const token = new URL(url, 'http://localhost').searchParams.get('token');
  if (token === null || token.length === 0) return null;

  try {
    return await verifier.verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * A room name is an authorization decision, not a string. Without this check a
 * client could subscribe to `order:<someone-elses-id>` and watch a stranger's
 * courier drive to their home address.
 *
 * Ownership of an order cannot be settled from the token alone, so joining an
 * order room is delegated to a callback the gateway supplies.
 */
export async function canJoinRoom(
  user: AuthenticatedUser,
  room: string,
  ownsOrder: (orderId: string, user: AuthenticatedUser) => Promise<boolean>,
): Promise<boolean> {
  const parsed = parseRoom(room);
  if (parsed === null) return false;

  switch (parsed.kind) {
    case 'user':
      return parsed.id === user.id;
    case 'customer':
      return parsed.id === user.customerId;
    case 'courier':
      return parsed.id === user.courierId;
    case 'order':
      return ownsOrder(parsed.id, user);
    case 'store':
      // Vendors watch their own stores; the store-to-vendor check happens in
      // the gateway, which can query.
      return user.vendorId !== undefined || can(user, PERMISSION.ORDER_READ_ANY);
    case 'operator':
      return can(user, PERMISSION.ORDER_READ_ANY);
    default:
      return false;
  }
}
