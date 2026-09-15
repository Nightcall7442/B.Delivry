/**
 * WebSocket gateway: auth handshake, connection registry, redis pub/sub fan-out for multi-instance.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { DEFAULT_LOCALE } from '@bazar/constants';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
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
import { canJoinRoom } from './auth.js';
import { room } from './rooms.js';

export interface Connection {
  id: string;
  socket: WebSocket;
  user: AuthenticatedUser;
  rooms: Set<string>;
  lastSeenAt: number;
}

export interface GatewayDeps {
  pubsub: PubSub;
  logger: Logger;
  ownsOrder: (orderId: string, user: AuthenticatedUser) => Promise<boolean>;
}

/** Sockets that stop answering pings are dropped rather than leaked. */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

/**
 * Holds the sockets attached to *this* process. A customer watching an order
 * may be connected to any instance, so nothing broadcasts directly: events go
 * through Redis pub/sub and each instance delivers to its own sockets.
 */
export class WebsocketGateway {
  private readonly connections = new Map<string, Connection>();
  /** room -> connection ids, so a broadcast is a set lookup, not a scan. */
  private readonly rooms = new Map<string, Set<string>>();
  private heartbeat: NodeJS.Timeout | null = null;

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
    for (const connection of this.connections.values()) connection.socket.close(1001, 'shutdown');
    this.connections.clear();
    this.rooms.clear();
  }

  /** Registers an authenticated socket and puts it in its own private rooms. */
  add(socket: WebSocket, user: AuthenticatedUser): Connection {
    const connection: Connection = {
      id: randomUUID(),
      socket,
      user,
      rooms: new Set(),
      lastSeenAt: Date.now(),
    };

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

    for (const name of connection.rooms) {
      const members = this.rooms.get(name);
      members?.delete(connectionId);
      if (members?.size === 0) this.rooms.delete(name);
    }

    this.connections.delete(connectionId);
    websocketConnections.set(this.connections.size);
  }

  async requestJoin(connection: Connection, name: string): Promise<boolean> {
    // ownsOrder reads the order through the service layer, which needs the
    // tenant context a socket message does not carry by itself.
    const allowed = await this.runAs(connection, () =>
      canJoinRoom(connection.user, name, this.deps.ownsOrder),
    );
    if (!allowed) return false;
    this.join(connection, name);
    return true;
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
