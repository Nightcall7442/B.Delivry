/**
 * Limits on what one websocket connection may ask for.
 */

/**
 * What a legitimate client needs, with room to spare. The customer, courier, vendor and admin apps
 * join a handful of rooms on (re)connect, ping every 20 s and a courier reports a fix every ~4 s;
 * none of them comes near these numbers, a script flooding the pubsub does.
 */
export const WS_LIMITS = {
  /** Rooms one socket may sit in, its own three personal rooms included. */
  MAX_ROOMS: 64,
  /** Sockets one account may hold at once; a new one past this evicts the oldest. */
  MAX_CONNECTIONS_PER_USER: 10,
  /** Any command: a burst of joins on reconnect, then a steady trickle. */
  COMMAND_BURST: 60,
  COMMANDS_PER_SECOND: 20,
  /** Location fixes ride the same budget, but a courier phone has no business sending > 1/s. */
  LOCATION_BURST: 5,
  LOCATIONS_PER_SECOND: 1,
  /** Dropped commands in one sweep (30 s) after which the socket is closed instead of ignored. */
  MAX_DROPPED_PER_SWEEP: 200,
} as const;

/** Classic token bucket: `capacity` at once, `refillPerSecond` sustained. */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.updatedAt = now;
  }

  take(now: number = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
