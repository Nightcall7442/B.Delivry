/**
 * Courier location ingest (REST /tracking/location, /location/batch and the websocket `location`
 * command) trusted the client: the order id named in a ping was broadcast into that order's room, so
 * a courier could draw dots on any customer's map, and positions, speeds and clocks went to the
 * screens and the table as sent. The order must be one this courier carries and has not finished;
 * everything else is bounded; and a socket may not flood the pubsub.
 *
 * Real TrackingService, gateway and handlers; the database, Redis and the socket are fakes.
 */
import { effectivePermissions } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { TrackingRepository } from '../../src/modules/tracking/repository/tracking.repository.js';
import {
  TrackingService,
  normalizePing,
} from '../../src/modules/tracking/service/tracking.service.js';
import { parseCommand } from '../../src/websocket/events.js';
import { WebsocketGateway } from '../../src/websocket/gateway.js';
import { handleLocation } from '../../src/websocket/handlers/courier-location.handler.js';
import { handleMessage } from '../../src/websocket/handlers/index.js';
import { WS_LIMITS } from '../../src/websocket/rate-limit.js';

const TENANT = 't1';
const NOW = new Date('2026-10-01T10:00:00.000Z');

const as = (roles: Role[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext(TENANT, 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}`,
      tenantId: TENANT,
      roles,
      permissions: effectivePermissions(roles),
      sessionId: 's1',
      locale: 'ru',
      ...ids,
    },
  }) as never;

const asCourier = as([ROLE.COURIER], { courierId: 'courier-1' });
const asCustomer = as([ROLE.CUSTOMER], { customerId: 'cust-1' });

const ping = (over: Record<string, unknown> = {}) => ({
  lat: 41.55,
  lng: 60.63,
  recordedAt: NOW,
  ...over,
});

type Emit = { rooms: readonly string[]; event: string; data: Record<string, unknown> };

/** `carried`: what the database says courier-1 carries, order id -> status. */
function build(carried: Record<string, string> = {}) {
  const emitted: Emit[] = [];
  const saved: { courierId: string; pings: Record<string, unknown>[] }[] = [];
  const asked: { courierId: string; orderIds: string[] }[] = [];
  const service = new TrackingService({
    repository: {
      async ordersOfCourier(courierId: string, orderIds: string[]) {
        asked.push({ courierId, orderIds });
        return new Map(
          orderIds.filter((id) => id in carried).map((id) => [id, carried[id] as string]),
        );
      },
      async savePings(courierId: string, pings: Record<string, unknown>[]) {
        saved.push({ courierId, pings });
      },
    },
    orders: {},
    delivery: {},
    eta: {},
    realtime: {
      async emitToRooms(rooms: readonly string[], event: string, data: Record<string, unknown>) {
        emitted.push({ rooms, event, data });
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
  } as never);
  return { service, emitted, saved, asked };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the order named in a ping', () => {
  it('is not trusted: a courier cannot put a dot on the map of an order they do not carry', async () => {
    // courier-1 carries o-own; o-victim belongs to someone else's delivery.
    const { service, emitted, saved } = build({ 'o-own': 'IN_DELIVERY' });

    await runWithContext(asCourier, () => service.push([ping({ orderId: 'o-victim' }) as never]));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.rooms).toEqual(['courier:courier-1']);
    expect(emitted[0]?.data.orderId).toBeNull();
    // The row is not tagged with someone else's order either (that would poison its history).
    expect(saved[0]?.pings[0]?.orderId).toBeUndefined();
  });

  it('still reaches the customer when the order is the courier own and open', async () => {
    const { service, emitted, saved } = build({ 'o-own': 'IN_DELIVERY' });

    await runWithContext(asCourier, () => service.push([ping({ orderId: 'o-own' }) as never]));

    expect(emitted[0]?.rooms).toEqual(['order:o-own', 'courier:courier-1']);
    expect(emitted[0]?.data).toMatchObject({ orderId: 'o-own', courierId: 'courier-1' });
    expect(saved[0]?.pings[0]?.orderId).toBe('o-own');
  });

  it('is asked of the database for this courier, once per distinct order of the batch', async () => {
    const { service, asked } = build({ a: 'IN_DELIVERY', b: 'IN_DELIVERY' });
    const points = [
      ping({ orderId: 'a', recordedAt: new Date(NOW.getTime() - 20_000) }),
      ping({ orderId: 'a', recordedAt: new Date(NOW.getTime() - 10_000) }),
      ping({ orderId: 'b' }),
    ];

    await runWithContext(asCourier, () => service.push(points as never));

    expect(asked).toEqual([{ courierId: 'courier-1', orderIds: ['a', 'b'] }]);
  });

  it('closes the live room once the order is over, but keeps the tag on the trace', async () => {
    for (const status of ['DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED']) {
      const { service, emitted, saved } = build({ 'o-done': status });
      await runWithContext(asCourier, () => service.push([ping({ orderId: 'o-done' }) as never]));
      expect(emitted[0]?.rooms).toEqual(['courier:courier-1']);
      expect(emitted[0]?.data.orderId).toBeNull();
      // A backlog uploaded after the drop-off is still the trace of that delivery.
      expect(saved[0]?.pings[0]?.orderId).toBe('o-done');
    }
  });

  it('is not looked up when the ping names none', async () => {
    const { service, emitted } = build();
    await runWithContext(asCourier, () => service.push([ping() as never]));
    expect(emitted[0]?.rooms).toEqual(['courier:courier-1']);
  });

  it('is looked up inside the caller tenant, for this courier, by the repository', async () => {
    const calls: { where: Record<string, unknown> }[] = [];
    const repository = new TrackingRepository({
      order: {
        async findMany(args: { where: Record<string, unknown> }) {
          calls.push(args);
          return [{ id: 'o1', status: 'PICKED_UP' }];
        },
      },
    } as never);

    const found = await runWithContext(asCourier, () =>
      repository.ordersOfCourier('courier-1', ['o1', 'o2']),
    );

    expect(calls[0]?.where).toEqual({
      id: { in: ['o1', 'o2'] },
      courierId: 'courier-1',
      tenantId: TENANT,
    });
    expect([...found]).toEqual([['o1', 'PICKED_UP']]);
  });

  it('only a courier may report a position at all', async () => {
    const { service, emitted } = build({ 'o-own': 'IN_DELIVERY' });
    await expect(
      runWithContext(asCustomer, () => service.push([ping({ orderId: 'o-own' }) as never])),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(emitted).toHaveLength(0);
  });
});

describe('what a ping may say', () => {
  it('drops a position that is not on the planet', () => {
    for (const bad of [
      { lat: 91 },
      { lat: -90.0001 },
      { lng: 181 },
      { lng: -1e308 },
      { lat: Number.NaN },
      { lng: Number.POSITIVE_INFINITY },
      { lat: '41.5' },
      { lng: null },
    ]) {
      expect(normalizePing(ping(bad) as never, NOW)).toBeNull();
    }
    expect(normalizePing(ping({ lat: 90, lng: -180 }) as never, NOW)).not.toBeNull();
  });

  it('clamps speed and accuracy, wraps the heading, and drops what is not a number', () => {
    const wild = normalizePing(
      ping({ speedKmh: 99_999, accuracyMeters: -5, heading: 725 }) as never,
      NOW,
    );
    expect(wild).toMatchObject({ speedKmh: 300, accuracyMeters: 0, heading: 5 });
    expect(normalizePing(ping({ heading: -90 }) as never, NOW)?.heading).toBe(270);

    const junk = normalizePing(
      ping({ speedKmh: 'fast', heading: { x: 1 }, accuracyMeters: Number.NaN }) as never,
      NOW,
    );
    expect(junk?.speedKmh).toBeUndefined();
    expect(junk?.heading).toBeUndefined();
    expect(junk?.accuracyMeters).toBeUndefined();
  });

  it('counts a clock that is far ahead, or unreadable, as now', () => {
    const future = normalizePing(
      ping({ recordedAt: new Date(NOW.getTime() + 3_600_000) }) as never,
      NOW,
    );
    expect(future?.recordedAt).toEqual(NOW);
    const garbage = normalizePing(ping({ recordedAt: new Date('not a date') }) as never, NOW);
    expect(garbage?.recordedAt).toEqual(NOW);
    const skew = new Date(NOW.getTime() + 30_000);
    expect(normalizePing(ping({ recordedAt: skew }) as never, NOW)?.recordedAt).toEqual(skew);
  });

  it('drops a ping older than a shift', () => {
    expect(
      normalizePing(ping({ recordedAt: new Date(NOW.getTime() - 7 * 3_600_000) }) as never, NOW),
    ).toBeNull();
    expect(
      normalizePing(ping({ recordedAt: new Date(NOW.getTime() - 5 * 3_600_000) }) as never, NOW),
    ).not.toBeNull();
  });

  it('ignores an order id that is not a plausible id', () => {
    for (const orderId of ['', 'x'.repeat(65), 42, { $ne: 1 }]) {
      expect(normalizePing(ping({ orderId }) as never, NOW)?.orderId).toBeUndefined();
    }
  });

  it('never broadcasts or saves what was dropped, and keeps junk out of the broadcast', async () => {
    const { service, emitted, saved } = build();
    await runWithContext(asCourier, () =>
      service.push([ping({ lat: 500 }), ping({ lng: 'x' })] as never),
    );
    expect(emitted).toHaveLength(0);
    expect(saved).toHaveLength(0);

    await runWithContext(asCourier, () =>
      service.push([ping({ heading: '<img src=x onerror=alert(1)>' })] as never),
    );
    expect(emitted[0]?.data.heading).toBeNull();
    expect(saved[0]?.pings[0]?.heading).toBeUndefined();
  });

  it('takes at most 200 pings in one call', async () => {
    const { service, saved } = build();
    const points = Array.from({ length: 500 }, (_, i) =>
      ping({ recordedAt: new Date(NOW.getTime() - (500 - i) * 6_000) }),
    );
    await runWithContext(asCourier, () => service.push(points as never));
    expect(saved[0]?.pings.length).toBeLessThanOrEqual(200);
    // The newest ones: the current position must survive.
    expect(saved[0]?.pings.at(-1)?.recordedAt).toEqual(points.at(-1)?.recordedAt);
  });
});

describe('a location command off the socket', () => {
  it('is rebuilt from known, typed fields only', () => {
    const command = parseCommand(
      JSON.stringify({
        action: 'location',
        lat: 41.5,
        lng: 60.6,
        heading: 'north',
        speedKmh: 12,
        orderId: 'o1',
        recordedAt: '2026-10-01T10:00:00.000Z',
        evil: { deep: true },
      }),
    );
    expect(command).toEqual({
      action: 'location',
      lat: 41.5,
      lng: 60.6,
      speedKmh: 12,
      orderId: 'o1',
      recordedAt: '2026-10-01T10:00:00.000Z',
    });
  });

  it('is refused without a numeric position, and join/leave without a short room name', () => {
    expect(parseCommand(JSON.stringify({ action: 'location', lat: '41', lng: 60 }))).toBeNull();
    expect(parseCommand(JSON.stringify({ action: 'location', lat: 1 }))).toBeNull();
    expect(parseCommand('null')).toBeNull();
    expect(parseCommand('[]')).toBeNull();
    expect(parseCommand(JSON.stringify({ action: 'join', room: 5 }))).toBeNull();
    expect(
      parseCommand(JSON.stringify({ action: 'join', room: `order:${'a'.repeat(5000)}` })),
    ).toBeNull();
    expect(parseCommand(JSON.stringify({ action: 'join', room: 'order:abc' }))).toEqual({
      action: 'join',
      room: 'order:abc',
    });
  });
});

// ---------------------------------------------------------------- the socket

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: string[] = [];
  closed: { code: number; reason: string }[] = [];
  send(payload: string) {
    this.sent.push(payload);
  }
  close(code: number, reason: string) {
    this.closed.push({ code, reason });
    this.readyState = 3;
  }
  ping() {}
  terminate() {}
}

const logger = { error() {}, warn() {}, info() {}, debug() {} };

function gatewayWith() {
  const guards = {
    ownsOrder: async () => false,
    ownsStore: async () => false,
    storeInTenant: async () => false,
    cityInTenant: async () => false,
  };
  const gateway = new WebsocketGateway({
    expiryJitterMs: 0,
    pubsub: { subscribe: async () => {}, publish: async () => {} } as never,
    logger: logger as never,
    ...guards,
  });
  const connect = (ids: Record<string, string>, roles: Role[] = [ROLE.COURIER]) => {
    const socket = new FakeSocket();
    const user = {
      id: 'u1',
      tenantId: TENANT,
      roles,
      permissions: effectivePermissions(roles),
      sessionId: 's1',
      locale: 'ru',
      ...ids,
    };
    const connection = gateway.add(socket as never, user as never, {
      expiresAt: Date.now() + 15 * 60_000,
      revalidate: async () => user,
    });
    return { socket, connection };
  };
  return { gateway, connect };
}

describe('the location stream of one socket', () => {
  it('is capped: a script sending a fix every millisecond gets a few through, not all of them', async () => {
    const { gateway, connect } = gatewayWith();
    const { connection } = connect({ courierId: 'courier-1' });
    const pushed: unknown[] = [];
    const tracking = { push: async (pings: unknown[]) => void pushed.push(...pings) };

    for (let i = 0; i < 100; i += 1) {
      await handleLocation(
        connection,
        { action: 'location', lat: 41.5, lng: 60.6, orderId: 'o1' },
        { gateway, tracking: tracking as never },
      );
    }

    expect(pushed).toHaveLength(WS_LIMITS.LOCATION_BURST);

    // A phone's normal pace (one fix every 4 s) is never held back.
    vi.advanceTimersByTime(4_000);
    await handleLocation(
      connection,
      { action: 'location', lat: 41.5, lng: 60.6 },
      { gateway, tracking: tracking as never },
    );
    expect(pushed).toHaveLength(WS_LIMITS.LOCATION_BURST + 1);
  });

  it('is not handed on at all for an account that is not a courier', async () => {
    const { gateway, connect } = gatewayWith();
    const { connection } = connect({ customerId: 'cust-1' }, [ROLE.CUSTOMER]);
    const pushed: unknown[] = [];

    await handleLocation(
      connection,
      { action: 'location', lat: 41.5, lng: 60.6 },
      { gateway, tracking: { push: async (p: unknown[]) => void pushed.push(...p) } as never },
    );

    expect(pushed).toHaveLength(0);
  });
});

describe('the command budget of one socket', () => {
  it('answers a burst of pings up to the budget and then says nothing, not even an error', async () => {
    const { gateway, connect } = gatewayWith();
    const { connection, socket } = connect({ courierId: 'courier-1' });
    const deps = { gateway, tracking: {} as never, logger: logger as never };

    for (let i = 0; i < 150; i += 1) {
      await handleMessage(connection, JSON.stringify({ action: 'ping' }), deps);
    }

    expect(socket.sent).toHaveLength(WS_LIMITS.COMMAND_BURST);
    expect(socket.closed).toHaveLength(0);
  });

  it('is closed with 4429 when it keeps hammering after the budget ran dry', async () => {
    const { gateway, connect } = gatewayWith();
    const { connection, socket } = connect({ courierId: 'courier-1' });
    const deps = { gateway, tracking: {} as never, logger: logger as never };

    for (let i = 0; i < WS_LIMITS.COMMAND_BURST + WS_LIMITS.MAX_DROPPED_PER_SWEEP + 5; i += 1) {
      await handleMessage(connection, 'garbage', deps);
    }

    expect(socket.closed).toEqual([{ code: 4429, reason: 'Too many requests' }]);
    expect(gateway.size).toBe(0);
  });

  it('refills: the steady pace of the real clients is never refused', async () => {
    const { gateway, connect } = gatewayWith();
    const { connection, socket } = connect({ courierId: 'courier-1' });
    const deps = { gateway, tracking: {} as never, logger: logger as never };

    // A courier phone: a ping every 20 s and a fix every 4 s, for ten minutes.
    for (let second = 0; second < 600; second += 4) {
      vi.advanceTimersByTime(4_000);
      await handleMessage(connection, JSON.stringify({ action: 'ping' }), deps);
    }

    expect(socket.sent).toHaveLength(150);
  });
});
