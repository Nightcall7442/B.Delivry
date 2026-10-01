/**
 * WebSocket gateway: auth handshake, connection registry, redis pub/sub fan-out for multi-instance.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { DEFAULT_LOCALE } from '@bazar/constants';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { UnauthorizedError } from '../common/errors/index.js';
import { runWithContext } from '../common/tenant/tenant-context.js';
import type { RequestContext } from '../common/types/request-context.js';
import type { Logger } from '../infrastructure/logger/index.js';
import {
  REALTIME_CHANNEL,
  isRealtimeMessage,
  type RealtimeMessage,
} from '../infrastructure/redis/realtime-events.js';
import type { PubSub } from '../infrastructure/redis/pubsub.js';
import { websocketConnections } from '../infrastructure/telemetry/metrics.js';
import { mayJoinRoom, type RoomGuards } from './auth.js';
import { TokenBucket, WS_LIMITS } from './rate-limit.js';
import { isPersonalRoom, parseRoom, room } from './rooms.js';

/** What the gateway holds a socket to once it is open: the credential it was let in with. */
export interface ConnectionSession {
  /** Epoch ms at which the access token stops being valid; the socket is closed then. */
  expiresAt: number;
  /** Re-runs the token check (signature, expiry, revoked session); throws UnauthorizedError once it fails. */
  revalidate: () => Promise<unknown>;
}

export interface Connection {
  id: string;
  socket: WebSocket;
  user: AuthenticatedUser;
  rooms: Set<string>;
  lastSeenAt: number;
  expiresAt: number;
  revalidate: ConnectionSession['revalidate'];
  /** Any command, join included. */
  commands: TokenBucket;
  /** Location fixes, on top of the command budget. */
  locations: TokenBucket;
  /** Commands dropped for want of budget since the last sweep. */
  dropped: number;
  roomsCheckedAt: number;
  expiryTimer: NodeJS.Timeout | null;
}

export interface GatewayDeps extends RoomGuards {
  pubsub: PubSub;
  logger: Logger;
  /** Spread of the token-expiry close, in ms; tests pin it to 0. */
  expiryJitterMs?: number;
}

/** Sockets that stop answering pings are dropped rather than leaked. */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
/** How often a held order/store/city room is checked against ownership again. */
const ROOM_RECHECK_MS = 5 * 60_000;
/** Revalidations in flight at once (each is a Redis lookup). */
const REVALIDATE_CONCURRENCY = 50;
/** setTimeout cannot take more than 2^31 - 1 ms. */
const MAX_TIMER_MS = 2_147_483_647;
/**
 * Sockets that came in with the same token (two windows of one browser share their storage) must
 * not all be told to renew in the same millisecond: two refreshes with one refresh token are a
 * replay, and the session dies for both. The token is already dead; the socket lingers a few seconds.
 */
const EXPIRY_JITTER_MS = 8_000;

/** Private close codes (4000-4999). The api-client renews its token on 4401 and reconnects. */
export const WS_CLOSE = {
  UNAUTHORIZED: 4401,
  TOO_MANY_CONNECTIONS: 4409,
  TOO_MANY_REQUESTS: 4429,
} as const;

/**
 * Holds the sockets attached to *this* process. A customer watching an order
 * may be connected to any instance, so nothing broadcasts directly: events go
 * through Redis pub/sub and each instance delivers to its own sockets.
 */
export class WebsocketGateway {
  private readonly connections = new Map<string, Connection>();
  /** room -> connection ids, so a broadcast is a set lookup, not a scan. */
  private readonly rooms = new Map<string, Set<string>>();
  /** user id -> connection ids, oldest first, so one account cannot multiply its own limits. */
  private readonly byUser = new Map<string, Set<string>>();
  private heartbeat: NodeJS.Timeout | null = null;
  private revalidating = false;

  constructor(private readonly deps: GatewayDeps) {}

  async start(): Promise<void> {
    await this.deps.pubsub.subscribe(REALTIME_CHANNEL, (payload) => {
      if (isRealtimeMessage(payload)) this.deliver(payload);
    });

    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  async stop(): Promise<void> {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    for (const connection of this.connections.values()) {
      if (connection.expiryTimer !== null) clearTimeout(connection.expiryTimer);
      connection.socket.close(1001, 'shutdown');
    }
    this.connections.clear();
    this.rooms.clear();
    this.byUser.clear();
  }

  /**
   * Registers an authenticated socket and puts it in its own private rooms. The socket lives only
   * as long as the access token it came in with: it is closed the moment that expires, and again
   * whenever a sweep finds the session revoked (logout, block). It never outlasts its credential.
   */
  add(socket: WebSocket, user: AuthenticatedUser, session: ConnectionSession): Connection {
    const now = Date.now();
    const connection: Connection = {
      id: randomUUID(),
      socket,
      user,
      rooms: new Set(),
      lastSeenAt: now,
      expiresAt: session.expiresAt,
      revalidate: session.revalidate,
      commands: new TokenBucket(WS_LIMITS.COMMAND_BURST, WS_LIMITS.COMMANDS_PER_SECOND, now),
      locations: new TokenBucket(WS_LIMITS.LOCATION_BURST, WS_LIMITS.LOCATIONS_PER_SECOND, now),
      dropped: 0,
      roomsCheckedAt: now,
      expiryTimer: null,
    };

    // An account with ten sockets open loses the oldest (a phone that changed network leaves a
    // ghost behind until the heartbeat notices) rather than getting ten budgets.
    const siblings = this.byUser.get(user.id) ?? new Set<string>();
    while (siblings.size >= WS_LIMITS.MAX_CONNECTIONS_PER_USER) {
      const oldest = siblings.values().next().value as string;
      const evicted = this.connections.get(oldest);
      if (evicted === undefined) siblings.delete(oldest);
      else this.close(evicted, WS_CLOSE.TOO_MANY_CONNECTIONS, 'Too many connections');
    }
    siblings.add(connection.id);
    this.byUser.set(user.id, siblings);

    connection.expiryTimer = setTimeout(
      () => this.close(connection, WS_CLOSE.UNAUTHORIZED, 'Token expired'),
      Math.min(
        Math.max(0, session.expiresAt - now) +
          Math.floor(Math.random() * (this.deps.expiryJitterMs ?? EXPIRY_JITTER_MS)),
        MAX_TIMER_MS,
      ),
    );
    connection.expiryTimer.unref();

    this.connections.set(connection.id, connection);
    websocketConnections.set(this.connections.size);

    // Personal rooms need no join: they are the socket's own identity.
    this.join(connection, room.user(user.id));
    if (user.courierId !== undefined) this.join(connection, room.courier(user.courierId));
    if (user.customerId !== undefined) this.join(connection, room.customer(user.customerId));

    socket.on('pong', () => {
      connection.lastSeenAt = Date.now();
    });

    return connection;
  }

  remove(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return;

    if (connection.expiryTimer !== null) clearTimeout(connection.expiryTimer);

    for (const name of connection.rooms) {
      const members = this.rooms.get(name);
      members?.delete(connectionId);
      if (members?.size === 0) this.rooms.delete(name);
    }

    const siblings = this.byUser.get(connection.user.id);
    siblings?.delete(connectionId);
    if (siblings?.size === 0) this.byUser.delete(connection.user.id);

    this.connections.delete(connectionId);
    websocketConnections.set(this.connections.size);
  }

  /** Ends the socket and forgets it; being closed twice (here and by the socket's own event) is fine. */
  close(connection: Connection, code: number, reason: string): void {
    try {
      connection.socket.close(code, reason);
    } catch {
      // Already gone.
    }
    this.remove(connection.id);
  }

  async requestJoin(connection: Connection, name: string): Promise<boolean> {
    if (connection.rooms.has(name)) return true;
    // A client that joins room after room is not browsing; it is filling the registry.
    if (connection.rooms.size >= WS_LIMITS.MAX_ROOMS) return false;

    // ownsOrder reads the order through the service layer, which needs the
    // tenant context a socket message does not carry by itself.
    let allowed = false;
    try {
      allowed = await this.runAs(connection, () => mayJoinRoom(connection.user, name, this.deps));
    } catch (error) {
      // A lookup that failed is not a yes.
      this.deps.logger.warn({ err: error, room: name }, 'websocket join check failed');
    }

    // The socket may have been closed while the lookup ran (hung up, token expired, session
    // revoked); joining then would leave a dead connection id in the room for good.
    if (!allowed || !this.connections.has(connection.id)) return false;
    // Joins that were all in flight together passed the size check above; hold the line here too.
    if (connection.rooms.size >= WS_LIMITS.MAX_ROOMS && !connection.rooms.has(name)) return false;
    this.join(connection, name);
    return true;
  }

  /** One command's worth of budget. A client that keeps hammering after it ran dry is cut off. */
  allowCommand(connection: Connection): boolean {
    if (connection.commands.take()) return true;
    connection.dropped += 1;
    if (
      connection.dropped >= WS_LIMITS.MAX_DROPPED_PER_SWEEP &&
      this.connections.has(connection.id)
    ) {
      this.close(connection, WS_CLOSE.TOO_MANY_REQUESTS, 'Too many requests');
    }
    return false;
  }

  /** Location fixes are lossy by nature: past the budget they are dropped without an answer. */
  allowLocation(connection: Connection): boolean {
    return connection.locations.take();
  }

  private join(connection: Connection, name: string): void {
    connection.rooms.add(name);
    const members = this.rooms.get(name) ?? new Set<string>();
    members.add(connection.id);
    this.rooms.set(name, members);
  }

  leave(connection: Connection, name: string): void {
    connection.rooms.delete(name);
    const members = this.rooms.get(name);
    members?.delete(connection.id);
    if (members?.size === 0) this.rooms.delete(name);
  }

  /** Delivers a message from Redis to the local sockets in that room. */
  private deliver(message: RealtimeMessage): void {
    const members = this.rooms.get(message.room);
    if (members === undefined || members.size === 0) return;

    const payload = JSON.stringify({
      event: message.event,
      data: message.data,
      at: message.at,
    });

    for (const connectionId of members) {
      const connection = this.connections.get(connectionId);
      if (connection === undefined) continue;
      // 1 === OPEN. A socket mid-close would throw on send.
      if (connection.socket.readyState !== 1) continue;

      try {
        connection.socket.send(payload);
      } catch (error) {
        this.deps.logger.warn({ err: error, room: message.room }, 'websocket send failed');
        this.remove(connectionId);
      }
    }
  }

  /** Pings everyone, drops whoever has not answered in a while. */
  private sweep(): void {
    const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;

    for (const connection of [...this.connections.values()]) {
      connection.dropped = 0;
      if (connection.lastSeenAt < cutoff) {
        connection.socket.terminate();
        this.remove(connection.id);
        continue;
      }
      try {
        connection.socket.ping();
      } catch {
        this.remove(connection.id);
      }
    }

    if (this.revalidating) return;
    this.revalidating = true;
    this.revalidate()
      .catch((error: unknown) =>
        this.deps.logger.warn({ err: error }, 'websocket revalidation failed'),
      )
      .finally(() => {
        this.revalidating = false;
      });
  }

  /**
   * Holds every open socket to its credential. The expiry timer covers the token running out; this
   * covers what happens in between: the session revoked (logout, role change, a blocked account)
   * and rooms whose owner changed (a courier taken off an order would otherwise keep hearing its
   * chat). A failure that is not a refusal (Redis down) keeps the socket and retries next sweep.
   */
  async revalidate(now: number = Date.now()): Promise<void> {
    const open = [...this.connections.values()];
    for (let i = 0; i < open.length; i += REVALIDATE_CONCURRENCY) {
      await Promise.all(open.slice(i, i + REVALIDATE_CONCURRENCY).map((c) => this.recheck(c, now)));
    }
  }

  private async recheck(connection: Connection, now: number): Promise<void> {
    if (!this.connections.has(connection.id)) return;
    if (connection.expiresAt <= now) {
      this.close(connection, WS_CLOSE.UNAUTHORIZED, 'Token expired');
      return;
    }

    try {
      await connection.revalidate();
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        this.close(connection, WS_CLOSE.UNAUTHORIZED, 'Session ended');
      } else {
        this.deps.logger.warn({ err: error }, 'websocket session check failed');
      }
      return;
    }

    if (now - connection.roomsCheckedAt < ROOM_RECHECK_MS) return;
    connection.roomsCheckedAt = now;
    await this.recheckRooms(connection);
  }

  private async recheckRooms(connection: Connection): Promise<void> {
    for (const name of [...connection.rooms]) {
      const parsed = parseRoom(name);
      if (parsed === null || isPersonalRoom(parsed.kind)) continue;
      try {
        const stillAllowed = await this.runAs(connection, () =>
          mayJoinRoom(connection.user, name, this.deps),
        );
        if (!stillAllowed && this.connections.has(connection.id)) this.leave(connection, name);
      } catch (error) {
        // The lookup failed, which is not a refusal: keep the room, ask again next time.
        this.deps.logger.warn({ err: error, room: name }, 'websocket room check failed');
      }
    }
  }

  /** Request context for work done on behalf of a socket message. */
  contextFor(connection: Connection): RequestContext {
    return {
      requestId: connection.id,
      tenantId: connection.user.tenantId,
      locale: connection.user.locale ?? DEFAULT_LOCALE,
      user: connection.user,
      ip: null,
      userAgent: null,
      startedAt: new Date(),
    };
  }

  runAs<T>(connection: Connection, fn: () => T): T {
    return runWithContext(this.contextFor(connection), fn);
  }

  get size(): number {
    return this.connections.size;
  }
}
