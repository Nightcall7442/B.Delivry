/**
 * Room naming: order:{id}, courier:{id}, customer:{id}, operator:{city}, store:{id}.
 */

/**
 * A room is just a string, but it is also an authorization boundary: the
 * gateway decides who may join by parsing it, so the format is fixed here and
 * nowhere else.
 */
export const room = {
  order: (orderId: string): string => `order:${orderId}`,
  courier: (courierId: string): string => `courier:${courierId}`,
  customer: (customerId: string): string => `customer:${customerId}`,
  user: (userId: string): string => `user:${userId}`,
  store: (storeId: string): string => `store:${storeId}`,
  /** Operators watch a whole city, not a single order. */
  operator: (cityId: string): string => `operator:${cityId}`,
} as const;

export type RoomKind = keyof typeof room;

export interface ParsedRoom {
  kind: RoomKind;
  id: string;
}

const KINDS = new Set<string>(['order', 'courier', 'customer', 'user', 'store', 'operator']);

/** Every id the platform issues is a uuid; anything else is a client making names up. */
const ROOM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseRoom(value: string): ParsedRoom | null {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!KINDS.has(kind) || !ROOM_ID.test(id)) return null;
  return { kind: kind as RoomKind, id };
}

/** Rooms that follow from who the socket is (its token) and need no ownership lookup to keep. */
export const isPersonalRoom = (kind: RoomKind): boolean =>
  kind === 'user' || kind === 'customer' || kind === 'courier';
