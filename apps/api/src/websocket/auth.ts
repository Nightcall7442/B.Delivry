/**
 * WS connection authentication (JWT) & authorization for room joins.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { PERMISSION } from '@bazar/constants';
import { can } from '@bazar/auth';
import type { TokenVerifier } from '../middleware/auth.middleware.js';
import { parseRoom } from './rooms.js';

/** A verified handshake: who is connecting, and until when that is true. */
export interface SocketSession {
  user: AuthenticatedUser;
  /** Kept to re-verify the socket later (revoked session, blocked user); never logged or sent. */
  token: string;
  /** Epoch ms at which the access token stops being valid. */
  expiresAt: number;
}

/**
 * Browsers cannot set headers on a websocket handshake, so the token arrives
 * as a query parameter. That means it can end up in access logs, which is why
 * these tokens are short-lived access tokens and never refresh tokens.
 */
export async function authenticateSocketSession(
  url: string,
  verifier: TokenVerifier,
): Promise<SocketSession | null> {
  const token = new URL(url, 'http://localhost').searchParams.get('token');
  if (token === null || token.length === 0) return null;

  try {
    const user = await verifier.verifyAccessToken(token);
    // A socket outlives the request that opened it, so it must know when its credential ends.
    // Without a readable expiry there is nothing to hold it to: refuse rather than guess.
    const expiresAt = tokenExpiry(token);
    if (expiresAt === null) return null;
    return { user, token, expiresAt };
  } catch {
    return null;
  }
}

export async function authenticateSocket(
  url: string,
  verifier: TokenVerifier,
): Promise<AuthenticatedUser | null> {
  return (await authenticateSocketSession(url, verifier))?.user ?? null;
}

/**
 * The `exp` claim in ms. The signature was already checked by the verifier, so this only reads the
 * payload; it never decides whether a token is valid.
 */
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (payload === undefined) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Ownership questions the token alone cannot answer, asked inside the socket's request context. */
export type RoomOwnership = (id: string, user: AuthenticatedUser) => Promise<boolean>;

/**
 * What the gateway needs to know about the world to settle a join. Each one is asked inside the
 * socket's own request context (so it is tenant-scoped) and answered from the database.
 */
export interface RoomGuards {
  /** The customer of the order, the courier carrying it, or the desk of its tenant. */
  ownsOrder: RoomOwnership;
  /** A vendor's own stall (tenant and vendor both match). */
  ownsStore: RoomOwnership;
  /** A store of the user's own tenant, for the desk. */
  storeInTenant: RoomOwnership;
  /** A city the user's own tenant operates in, for the desk. */
  cityInTenant: RoomOwnership;
}

/**
 * A room name is an authorization decision, not a string. Without this check a
 * client could subscribe to `order:<someone-elses-id>` and watch a stranger's
 * courier drive to their home address.
 *
 * Ownership of an order cannot be settled from the token alone, so joining an
 * order room is delegated to a callback the gateway supplies.
 *
 * This is the question of ROLE: may this kind of user ask for this kind of room. It says yes to the
 * desk for every store and city because `order:read_any` means "staff", not "staff of every
 * tenant"; whose store or city it is, is `roomInTenant`'s question, and `mayJoinRoom` asks both.
 */
export async function canJoinRoom(
  user: AuthenticatedUser,
  room: string,
  ownsOrder: (orderId: string, user: AuthenticatedUser) => Promise<boolean>,
  ownsStore: (storeId: string, user: AuthenticatedUser) => Promise<boolean>,
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
      // A stall hears the new orders of its own store only; the desk hears every store.
      if (can(user, PERMISSION.ORDER_READ_ANY)) return true;
      return user.vendorId !== undefined && ownsStore(parsed.id, user);
    case 'operator':
      return can(user, PERMISSION.ORDER_READ_ANY);
    default:
      return false;
  }
}

/**
 * Whether the room belongs to the user's own tenant. Stores carry a tenant; cities are shared
 * reference data, so a tenant's city is one it has business in (a stall, a courier, an address).
 * Orders are tenant-scoped by the orders service inside `ownsOrder`, and the personal rooms follow
 * the token's own ids, so only the two rooms the desk may name freely need asking.
 */
export async function roomInTenant(
  user: AuthenticatedUser,
  room: string,
  guards: Pick<RoomGuards, 'storeInTenant' | 'cityInTenant'>,
): Promise<boolean> {
  const parsed = parseRoom(room);
  if (parsed === null) return false;

  switch (parsed.kind) {
    case 'store':
      return guards.storeInTenant(parsed.id, user);
    case 'operator':
      return guards.cityInTenant(parsed.id, user);
    default:
      return true;
  }
}

/** The whole decision behind a join: the right role, and a room of the user's own tenant. */
export async function mayJoinRoom(
  user: AuthenticatedUser,
  room: string,
  guards: RoomGuards,
): Promise<boolean> {
  if (!(await canJoinRoom(user, room, guards.ownsOrder, guards.ownsStore))) return false;
  return roomInTenant(user, room, guards);
}
