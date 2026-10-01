/**
 * Websocket rooms and connections. The desk's check for a store or city room was "has order:read_any",
 * which is staff of ONE tenant being let into every tenant's rooms. A connection also outlived its
 * credential: an expired access token, a logout or a blocked account left the socket in its rooms,
 * still receiving, until the client chose to hang up. And nothing bounded how many rooms or sockets
 * one account could hold, or how fast it could command them.
 *
 * Real roles, real can(), real guards and gateway; the database, orders service, Redis and sockets
 * are fakes.
 */
import { can, effectivePermissions } from '@bazar/auth';
import { PERMISSION, ROLE, type Role } from '@bazar/constants';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../src/common/errors/index.js';
import { requireContext } from '../../src/common/tenant/tenant-context.js';
import { authenticateSocketSession, mayJoinRoom, tokenExpiry } from '../../src/websocket/auth.js';
import { WebsocketGateway } from '../../src/websocket/gateway.js';
import { createRoomGuards } from '../../src/websocket/guards.js';
import { WS_LIMITS } from '../../src/websocket/rate-limit.js';
import { parseRoom } from '../../src/websocket/rooms.js';

const NOW = new Date('2026-10-01T10:00:00.000Z');
const logger = { error() {}, warn() {}, info() {}, debug() {} };

const userOf = (
  roles: Role[],
  tenantId: string,
  ids: { customerId?: string; vendorId?: string; courierId?: string; id?: string } = {},
) => ({
  id: ids.id ?? `user-${roles.join('-')}-${tenantId}`,
  tenantId,
  roles,
  permissions: effectivePermissions(roles),
  sessionId: 's1',
  locale: 'ru' as const,
  ...ids,
});

// ---------------------------------------------------------------- the world

/** Two tenants. Cities are shared: GeoPlace has no tenant. */
const STORES = [
  { id: 'store-a1', tenantId: 't1', vendorId: 'vendor-1', cityId: 'city-urgench' },
  { id: 'store-a2', tenantId: 't1', vendorId: 'vendor-2', cityId: 'city-urgench' },
  { id: 'store-b1', tenantId: 't2', vendorId: 'vendor-9', cityId: 'city-khiva' },
];
const COURIERS = [{ id: 'courier-9', tenantId: 't2', cityId: 'city-bukhara' }];
const ADDRESSES: { tenantId: string; cityId: string }[] = [];

const ORDER = {
  id: 'o1',
  tenantId: 't1',
  status: 'IN_DELIVERY',
  customerId: 'cust-1',
  courierId: 'courier-1',
  store: { vendorId: 'vendor-1' },
};

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

const table = (rows: Record<string, unknown>[]) => ({
  async findFirst({ where }: { where: Record<string, unknown> }) {
    return rows.find((row) => matches(row, where)) ?? null;
  },
});

function guards(orderLookup?: (id: string) => Promise<unknown>) {
  return createRoomGuards({
    prisma: {
      store: table(STORES),
      courier: table(COURIERS),
      address: table(ADDRESSES),
    } as never,
    orders: {
      // What the real OrdersService.get enforces: tenant, then the order's parties and the desk.
      get:
        orderLookup ??
        (async (orderId: string) => {
          const user = requireContext().user!;
          if (orderId !== ORDER.id) throw new NotFoundError('Order', orderId);
          const allowed = can(user, PERMISSION.ORDER_READ, {
            tenantId: ORDER.tenantId,
            customerId: ORDER.customerId,
            vendorId: ORDER.store.vendorId,
            ...(ORDER.courierId === null ? {} : { courierId: ORDER.courierId }),
          });
          if (!allowed) throw new ForbiddenError('Missing permission: order:read');
          return ORDER;
        }),
    } as never,
  });
}

// ---------------------------------------------------------------- fakes

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: { event: string; data: unknown }[] = [];
  closed: { code: number; reason: string }[] = [];
  send(payload: string) {
    const { event, data } = JSON.parse(payload) as { event: string; data: unknown };
    this.sent.push({ event, data });
  }
  close(code: number, reason: string) {
    this.closed.push({ code, reason });
    this.readyState = 3;
  }
  /** A healthy client answers the heartbeat. */
  ping() {
    this.emit('pong');
  }
  terminate() {}
}

const started: WebsocketGateway[] = [];

function harness(roomGuards = guards(), options: { expiryJitterMs?: number } = {}) {
  let deliver: (payload: unknown) => void = () => {};
  const gateway = new WebsocketGateway({
    pubsub: {
      subscribe: async (_channel: string, handler: (payload: unknown) => void) => {
        deliver = handler;
      },
      publish: async () => {},
    } as never,
    logger: logger as never,
    expiryJitterMs: options.expiryJitterMs ?? 0,
    ...roomGuards,
  });
  // Subscribes synchronously, so `publish` below reaches the gateway at once.
  void gateway.start();
  started.push(gateway);

  const connect = (
    user: ReturnType<typeof userOf>,
    session: { expiresAt?: number; revalidate?: () => Promise<unknown> } = {},
  ) => {
    const socket = new FakeSocket();
    const connection = gateway.add(socket as never, user as never, {
      expiresAt: session.expiresAt ?? Date.now() + 15 * 60_000,
      revalidate: session.revalidate ?? (async () => user),
    });
    return { socket, connection };
  };

  /** Publishes to a room the way the realtime publisher does. */
  const publish = (room: string, event = 'order:status_changed') =>
    deliver({ room, event, data: { n: 1 }, at: NOW.toISOString() });

  return { gateway, connect, publish };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(async () => {
  for (const gateway of started.splice(0)) await gateway.stop();
  vi.useRealTimers();
});

// ---------------------------------------------------------------- joins

describe('joining a store room', () => {
  it('keeps the desk to the stores of its own tenant', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.ADMIN], 't1'));

    expect(await gateway.requestJoin(connection, 'store:store-a1')).toBe(true);
    expect(await gateway.requestJoin(connection, 'store:store-a2')).toBe(true);
    // The other tenant's stall: same permission, someone else's business.
    expect(await gateway.requestJoin(connection, 'store:store-b1')).toBe(false);
    expect(await gateway.requestJoin(connection, 'store:no-such-store')).toBe(false);
  });

  it('keeps an operator of another tenant out of the same stalls', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.OPERATOR], 't2'));

    expect(await gateway.requestJoin(connection, 'store:store-a1')).toBe(false);
    expect(await gateway.requestJoin(connection, 'store:store-b1')).toBe(true);
  });

  it('gives a vendor their own stalls and nobody else', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.VENDOR], 't1', { vendorId: 'vendor-1' }));

    expect(await gateway.requestJoin(connection, 'store:store-a1')).toBe(true);
    // Same tenant, another vendor.
    expect(await gateway.requestJoin(connection, 'store:store-a2')).toBe(false);
    expect(await gateway.requestJoin(connection, 'store:store-b1')).toBe(false);
  });

  it('refuses a vendor token without a vendor, and everyone who is not staff or a vendor', async () => {
    const { gateway, connect } = harness();
    for (const who of [
      userOf([ROLE.VENDOR], 't1'),
      userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }),
      userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' }),
    ]) {
      const { connection } = connect(who);
      expect(await gateway.requestJoin(connection, 'store:store-a1')).toBe(false);
    }
  });
});

describe('joining a city room', () => {
  it('lets the desk watch a city its tenant has a stall in', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.OPERATOR], 't1'));
    expect(await gateway.requestJoin(connection, 'operator:city-urgench')).toBe(true);
  });

  it('keeps the desk out of a city only another tenant works in', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.ADMIN], 't1'));
    // t2 has a stall in Khiva and a courier in Bukhara; t1 has nothing there.
    expect(await gateway.requestJoin(connection, 'operator:city-khiva')).toBe(false);
    expect(await gateway.requestJoin(connection, 'operator:city-bukhara')).toBe(false);
    expect(await gateway.requestJoin(connection, 'operator:city-nowhere')).toBe(false);
  });

  it('counts a courier as presence in a city', async () => {
    const { gateway, connect } = harness();
    const { connection } = connect(userOf([ROLE.ADMIN], 't2'));
    expect(await gateway.requestJoin(connection, 'operator:city-bukhara')).toBe(true);
  });

  it('does not count a saved customer address: anybody can save one in any city', async () => {
    const { gateway, connect } = harness();
    ADDRESSES.push({ tenantId: 't1', cityId: 'city-khiva' });
    try {
      const t1 = connect(userOf([ROLE.ADMIN], 't1', { id: 'other-admin' }));
      expect(await gateway.requestJoin(t1.connection, 'operator:city-khiva')).toBe(false);
    } finally {
      ADDRESSES.pop();
    }
  });

  it('is for the desk only', async () => {
    const { gateway, connect } = harness();
    for (const who of [
      userOf([ROLE.VENDOR], 't1', { vendorId: 'vendor-1' }),
      userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }),
      userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' }),
    ]) {
      const { connection } = connect(who);
      expect(await gateway.requestJoin(connection, 'operator:city-urgench')).toBe(false);
    }
  });
});

describe('joining an order room', () => {
  const join = async (who: ReturnType<typeof userOf>, room = 'order:o1') => {
    const { gateway, connect } = harness();
    return gateway.requestJoin(connect(who).connection, room);
  };

  it('is for the customer, the carrying courier and the desk of the tenant', async () => {
    expect(await join(userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }))).toBe(true);
    expect(await join(userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' }))).toBe(true);
    expect(await join(userOf([ROLE.OPERATOR], 't1'))).toBe(true);
  });

  it('is not for another customer, another courier, or the desk of another tenant', async () => {
    expect(await join(userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-2' }))).toBe(false);
    expect(await join(userOf([ROLE.COURIER], 't1', { courierId: 'courier-2' }))).toBe(false);
    expect(await join(userOf([ROLE.ADMIN], 't2'))).toBe(false);
  });

  it('is not for the stall: the order room carries the road to the door and the chat', async () => {
    expect(await join(userOf([ROLE.VENDOR], 't1', { vendorId: 'vendor-1' }))).toBe(false);
  });

  it('is denied, not granted, when the lookup itself fails', async () => {
    const { gateway, connect } = harness(
      guards(async () => {
        throw new Error('connection reset');
      }),
    );
    const { connection } = connect(userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }));
    expect(await gateway.requestJoin(connection, 'order:o1')).toBe(false);
  });
});

describe('room names', () => {
  it('are ids, not free text', () => {
    expect(parseRoom('order:abc-123')).toEqual({ kind: 'order', id: 'abc-123' });
    for (const bad of [
      'order:',
      `order:${'a'.repeat(65)}`,
      'order:a b',
      'order:../x',
      'order:a:b',
      'order:a%00',
      'nope:abc',
      ':abc',
    ]) {
      expect(parseRoom(bad)).toBeNull();
    }
  });

  it('personal rooms are the token own', async () => {
    const user = userOf([ROLE.COURIER], 't1', { courierId: 'courier-1', id: 'u-me' });
    const none = guards();
    expect(await mayJoinRoom(user as never, 'user:u-me', none)).toBe(true);
    expect(await mayJoinRoom(user as never, 'user:u-you', none)).toBe(false);
    expect(await mayJoinRoom(user as never, 'courier:courier-1', none)).toBe(true);
    expect(await mayJoinRoom(user as never, 'courier:courier-2', none)).toBe(false);
    // No customer profile on the token is never a customer room of "undefined".
    expect(await mayJoinRoom(user as never, 'customer:undefined', none)).toBe(false);
  });
});

// ---------------------------------------------------------------- limits

describe('how much one socket may hold', () => {
  it('stops at the room limit, and joining a room it is already in is free', async () => {
    const { gateway, connect } = harness(
      createRoomGuards({
        prisma: {
          store: table([]),
          courier: { findFirst: async () => ({ id: 'c' }) },
          address: table([]),
        } as never,
        orders: {} as never,
      }),
    );
    const { connection } = connect(userOf([ROLE.ADMIN], 't1'));

    let joined = 0;
    for (let i = 0; i < WS_LIMITS.MAX_ROOMS + 20; i += 1) {
      vi.advanceTimersByTime(1_000); // the command budget is not what is under test
      if (await gateway.requestJoin(connection, `operator:city-${i}`)) joined += 1;
    }

    // Its own `user:` room already counts.
    expect(joined).toBe(WS_LIMITS.MAX_ROOMS - 1);
    expect(connection.rooms.size).toBe(WS_LIMITS.MAX_ROOMS);
    expect(await gateway.requestJoin(connection, 'operator:city-0')).toBe(true);
  });

  it('closes the oldest socket of an account that opens one too many', () => {
    const { gateway, connect } = harness();
    const user = userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' });
    const sockets = Array.from({ length: WS_LIMITS.MAX_CONNECTIONS_PER_USER }, () => connect(user));
    expect(gateway.size).toBe(WS_LIMITS.MAX_CONNECTIONS_PER_USER);

    const newest = connect(user);

    expect(sockets[0]?.socket.closed).toEqual([{ code: 4409, reason: 'Too many connections' }]);
    expect(sockets[1]?.socket.closed).toHaveLength(0);
    expect(newest.socket.closed).toHaveLength(0);
    expect(gateway.size).toBe(WS_LIMITS.MAX_CONNECTIONS_PER_USER);
  });

  it('does not count another account against this one', () => {
    const { gateway, connect } = harness();
    for (let i = 0; i < 25; i += 1) connect(userOf([ROLE.CUSTOMER], 't1', { id: `u${i}` }));
    expect(gateway.size).toBe(25);
  });

  it('does not put a socket that hung up mid-check into a room for good', async () => {
    let release: (value: boolean) => void = () => {};
    const slow = {
      ...guards(),
      cityInTenant: () => new Promise<boolean>((resolve) => (release = resolve)),
    };
    const { gateway, connect, publish } = harness(slow);
    const { connection, socket } = connect(userOf([ROLE.ADMIN], 't1'));

    const joining = gateway.requestJoin(connection, 'operator:city-urgench');
    // Let the join get as far as the slow lookup.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    gateway.remove(connection.id); // the client hung up while the lookup ran
    release(true);

    expect(await joining).toBe(false);
    expect(connection.rooms.has('operator:city-urgench')).toBe(false);
    publish('operator:city-urgench');
    expect(socket.sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- handshake

const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');

describe('the handshake', () => {
  const verifier = (user: object) => ({ verifyAccessToken: async () => user as never });

  it('remembers when the token runs out', async () => {
    const exp = Math.floor(NOW.getTime() / 1000) + 900;
    const user = userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' });

    const session = await authenticateSocketSession(`/ws?token=${jwt({ exp })}`, verifier(user));

    expect(session?.expiresAt).toBe(exp * 1000);
    expect(session?.user).toBe(user);
  });

  it('refuses a token that verifies but says nothing about its expiry, or none at all', async () => {
    const user = userOf([ROLE.CUSTOMER], 't1');
    expect(await authenticateSocketSession(`/ws?token=${jwt({})}`, verifier(user))).toBeNull();
    expect(await authenticateSocketSession('/ws?token=garbage', verifier(user))).toBeNull();
    expect(await authenticateSocketSession('/ws', verifier(user))).toBeNull();
    const rejecting = {
      verifyAccessToken: async () => {
        throw new UnauthorizedError('Session revoked');
      },
    };
    expect(await authenticateSocketSession(`/ws?token=${jwt({ exp: 1 })}`, rejecting)).toBeNull();
  });

  it('reads exp in seconds and gives milliseconds', () => {
    expect(tokenExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
    expect(tokenExpiry(jwt({ exp: '1800000000' }))).toBeNull();
    expect(tokenExpiry('a.b')).toBeNull();
  });
});

// ---------------------------------------------------------------- the credential

describe('a socket and its credential', () => {
  const customer = userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' });

  it('is closed with 4401 the moment its access token expires', async () => {
    const { gateway, connect, publish } = harness();
    const { connection, socket } = connect(customer, { expiresAt: Date.now() + 15 * 60_000 });
    await gateway.requestJoin(connection, 'order:o1');

    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(socket.closed).toHaveLength(0);
    publish('order:o1');
    expect(socket.sent).toHaveLength(1);

    vi.advanceTimersByTime(1);

    expect(socket.closed).toEqual([{ code: 4401, reason: 'Token expired' }]);
    expect(gateway.size).toBe(0);
    publish('order:o1');
    expect(socket.sent).toHaveLength(1);
  });

  it('spreads the close of sockets that share one token, so their renewals do not collide', () => {
    // Two windows of one browser come in on the same token; told in the same millisecond they would
    // both spend the one refresh token, and the second spend ends the session for both.
    const random = vi.spyOn(Math, 'random');
    const { connect } = harness(guards(), { expiryJitterMs: 8_000 });
    const expiresAt = Date.now() + 60_000;
    random.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    const first = connect(customer, { expiresAt });
    const second = connect(customer, { expiresAt });

    vi.advanceTimersByTime(60_000 + 799);
    expect(first.socket.closed).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(first.socket.closed[0]?.code).toBe(4401);
    expect(second.socket.closed).toHaveLength(0);
    vi.advanceTimersByTime(6_400);
    expect(second.socket.closed[0]?.code).toBe(4401);
    random.mockRestore();
  });

  it('is closed on connect if the token is already spent', () => {
    const { gateway, connect } = harness();
    const { socket } = connect(customer, { expiresAt: Date.now() - 5_000 });
    vi.advanceTimersByTime(0);
    expect(socket.closed[0]?.code).toBe(4401);
    expect(gateway.size).toBe(0);
  });

  it('is closed when its session is revoked (logout, role change, a blocked account)', async () => {
    const { gateway, connect, publish } = harness();
    let revoked = false;
    const { connection, socket } = connect(customer, {
      revalidate: async () => {
        if (revoked) throw new UnauthorizedError('Session revoked');
      },
    });
    await gateway.requestJoin(connection, 'order:o1');

    await gateway.revalidate();
    expect(socket.closed).toHaveLength(0);

    revoked = true; // an admin blocks the account
    await gateway.revalidate();

    expect(socket.closed).toEqual([{ code: 4401, reason: 'Session ended' }]);
    expect(gateway.size).toBe(0);
    publish('order:o1');
    expect(socket.sent).toHaveLength(0);
  });

  it('survives a Redis hiccup: a failed check is not a revoked session', async () => {
    const { gateway, connect } = harness();
    const { socket } = connect(customer, {
      revalidate: async () => {
        throw new Error('ECONNRESET');
      },
    });

    await gateway.revalidate();

    expect(socket.closed).toHaveLength(0);
    expect(gateway.size).toBe(1);
  });

  it('is swept on the heartbeat, not only when someone remembers to call revalidate', async () => {
    const { gateway, connect } = harness();
    const { socket } = connect(customer, {
      revalidate: async () => {
        throw new UnauthorizedError('Session revoked');
      },
    });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(socket.closed[0]?.code).toBe(4401);
  });

  it('loses a room it no longer owns, e.g. a courier taken off the order', async () => {
    let carrying = true;
    const { gateway, connect, publish } = harness(
      guards(async () => ({ ...ORDER, courierId: carrying ? 'courier-1' : 'courier-2' })),
    );
    const courier = userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' });
    const { connection, socket } = connect(courier);
    expect(await gateway.requestJoin(connection, 'order:o1')).toBe(true);

    publish('order:o1');
    expect(socket.sent).toHaveLength(1);

    carrying = false; // the order was reassigned
    await gateway.revalidate(Date.now() + 6 * 60_000);

    expect(connection.rooms.has('order:o1')).toBe(false);
    publish('order:o1');
    expect(socket.sent).toHaveLength(1);
    // Its own rooms are untouched, and so is the connection.
    expect(connection.rooms.has('courier:courier-1')).toBe(true);
    expect(socket.closed).toHaveLength(0);
  });

  it('keeps a room when the ownership lookup fails rather than refuses', async () => {
    let healthy = true;
    const { gateway, connect } = harness(
      guards(async () => {
        if (!healthy) throw new Error('db down');
        return ORDER;
      }),
    );
    const { connection } = connect(userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }));
    expect(await gateway.requestJoin(connection, 'order:o1')).toBe(true);

    healthy = false;
    await gateway.revalidate(Date.now() + 6 * 60_000);

    expect(connection.rooms.has('order:o1')).toBe(true);
  });

  it('does not re-check rooms on every sweep (an order lookup is a database read)', async () => {
    let lookups = 0;
    const { gateway, connect } = harness(
      guards(async () => {
        lookups += 1;
        return ORDER;
      }),
    );
    const { connection } = connect(userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }));
    await gateway.requestJoin(connection, 'order:o1');
    expect(lookups).toBe(1);

    await gateway.revalidate(Date.now() + 30_000);
    await gateway.revalidate(Date.now() + 60_000);

    expect(lookups).toBe(1);
  });
});
