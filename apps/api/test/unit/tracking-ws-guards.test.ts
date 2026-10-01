/**
 * The questions behind a room join, asked of `createRoomGuards` itself (the gateway-level behaviour
 * is in tracking-ws-rooms.test.ts).
 *
 * `ownsOrder` reads the order through the orders service, which REFUSES (403, or 404 across tenants)
 * a caller who is no longer a party to it. On a re-check that refusal has to be a "no": the gateway
 * keeps a room whose check THROWS (a database that blinked is not a refusal), so a refusal that
 * escaped as an error would let a courier taken off an order keep listening to its chat for good.
 *
 * `cityInTenant`: cities are shared reference data, so "the tenant's city" means one it has business
 * in, a stall or a courier there. A saved customer address proves nothing: anybody can save one in
 * any city.
 */
import { effectivePermissions } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { WebsocketGateway } from '../../src/websocket/gateway.js';
import { createRoomGuards } from '../../src/websocket/guards.js';

const userOf = (
  roles: Role[],
  tenantId: string,
  ids: { customerId?: string; vendorId?: string; courierId?: string } = {},
) => ({
  id: `user-${roles.join('-')}-${tenantId}`,
  tenantId,
  roles,
  permissions: effectivePermissions(roles),
  sessionId: 's1',
  locale: 'ru' as const,
  ...ids,
});

const ORDER = {
  id: 'o1',
  tenantId: 't1',
  status: 'IN_DELIVERY',
  customerId: 'cust-1',
  courierId: 'courier-1' as string | null,
  store: { vendorId: 'vendor-1' },
};

// ---------------------------------------------------------------- ownsOrder

describe('ownsOrder', () => {
  function guards(get: (orderId: string) => Promise<unknown>) {
    const asked: string[] = [];
    const roomGuards = createRoomGuards({
      prisma: {} as never,
      orders: {
        get: async (orderId: string) => {
          asked.push(orderId);
          return get(orderId);
        },
      } as never,
    });
    return { ownsOrder: roomGuards.ownsOrder, asked };
  }

  const found =
    (order: unknown = ORDER) =>
    async () =>
      order;

  it('is for the customer of the order, the courier carrying it and the desk', async () => {
    const { ownsOrder, asked } = guards(found());
    for (const who of [
      userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' }),
      userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' }),
      userOf([ROLE.OPERATOR], 't1'),
      userOf([ROLE.ADMIN], 't1'),
    ]) {
      expect(await ownsOrder('o1', who as never), who.roles.join()).toBe(true);
    }
    expect(asked).toEqual(['o1', 'o1', 'o1', 'o1']);
  });

  it('is not for anyone else the orders service lets read the order', async () => {
    const { ownsOrder } = guards(found());
    for (const who of [
      userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-2' }),
      userOf([ROLE.COURIER], 't1', { courierId: 'courier-2' }),
      // The stall may read its order, but the room carries the road to the door and the chat.
      userOf([ROLE.VENDOR], 't1', { vendorId: 'vendor-1' }),
      // A vendor-role token without a vendor profile is not "the desk" either.
      userOf([ROLE.VENDOR], 't1'),
    ]) {
      expect(await ownsOrder('o1', who as never), who.roles.join()).toBe(false);
    }
  });

  it('gives a courier nothing on an order that has no courier yet', async () => {
    const { ownsOrder } = guards(found({ ...ORDER, courierId: null }));
    expect(
      await ownsOrder('o1', userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' }) as never),
    ).toBe(false);
  });

  it('answers no, and does not throw, when the orders service refuses the caller', async () => {
    // A courier taken off the order: the service no longer lets them read it.
    const { ownsOrder } = guards(async () => {
      throw new ForbiddenError('Missing permission: order:read');
    });
    const courier = userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' });
    await expect(ownsOrder('o1', courier as never)).resolves.toBe(false);
  });

  it('answers no, and does not throw, when the order is not found (gone, or of another tenant)', async () => {
    const { ownsOrder } = guards(async (orderId) => {
      throw new NotFoundError('Order', orderId);
    });
    const customer = userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' });
    await expect(ownsOrder('o1', customer as never)).resolves.toBe(false);
  });

  it('lets any other failure through: a lookup that failed is neither a yes nor a no', async () => {
    const failure = new Error('connection reset');
    const { ownsOrder } = guards(async () => {
      throw failure;
    });
    const customer = userOf([ROLE.CUSTOMER], 't1', { customerId: 'cust-1' });
    await expect(ownsOrder('o1', customer as never)).rejects.toBe(failure);
  });
});

// ---------------------------------------------------------------- a held order room, re-checked

class FakeSocket extends EventEmitter {
  closed: { code: number; reason: string }[] = [];
  send() {}
  close(code: number, reason: string) {
    this.closed.push({ code, reason });
  }
  terminate() {}
}

describe('an order room that is held when the order is taken away', () => {
  const started: WebsocketGateway[] = [];
  afterEach(async () => {
    for (const gateway of started.splice(0)) await gateway.stop();
  });

  /** A courier in the order room; the orders service answers as `lookup` says from then on. */
  async function holdingTheRoom(lookup: () => Promise<unknown>) {
    let answer: () => Promise<unknown> = async () => ORDER;
    const gateway = new WebsocketGateway({
      pubsub: {} as never,
      logger: { error() {}, warn() {}, info() {}, debug() {} } as never,
      expiryJitterMs: 0,
      ...createRoomGuards({
        prisma: {} as never,
        orders: { get: () => answer() } as never,
      }),
    });
    started.push(gateway);
    const courier = userOf([ROLE.COURIER], 't1', { courierId: 'courier-1' });
    const socket = new FakeSocket();
    const connection = gateway.add(socket as never, courier as never, {
      expiresAt: Date.now() + 60 * 60_000,
      revalidate: async () => courier,
    });
    expect(await gateway.requestJoin(connection, 'order:o1')).toBe(true);

    answer = lookup;
    // Past the interval at which held rooms are asked again.
    await gateway.revalidate(Date.now() + 6 * 60_000);
    return { connection, socket };
  }

  it('is lost when the orders service refuses the courier who was taken off the order', async () => {
    const { connection, socket } = await holdingTheRoom(async () => {
      throw new ForbiddenError('Missing permission: order:read');
    });
    expect(connection.rooms.has('order:o1')).toBe(false);
    // Its own rooms, and the connection, are untouched.
    expect(connection.rooms.has('courier:courier-1')).toBe(true);
    expect(socket.closed).toEqual([]);
  });

  it('is lost when the order is no longer found', async () => {
    const { connection } = await holdingTheRoom(async () => {
      throw new NotFoundError('Order', 'o1');
    });
    expect(connection.rooms.has('order:o1')).toBe(false);
  });

  it('is kept when the lookup itself fails: asked again at the next re-check', async () => {
    const { connection } = await holdingTheRoom(async () => {
      throw new Error('db down');
    });
    expect(connection.rooms.has('order:o1')).toBe(true);
  });
});

// ---------------------------------------------------------------- cityInTenant

describe('cityInTenant', () => {
  interface Row {
    id: string;
    tenantId: string;
    cityId: string;
  }

  function guards(rows: { stores?: Row[]; couriers?: Row[] }) {
    const asked: { table: string; where: Record<string, unknown> }[] = [];
    const find = (table: string, list: Row[]) => ({
      async findFirst({ where }: { where: Record<string, unknown> }) {
        asked.push({ table, where });
        return (
          list.find((row) =>
            Object.entries(where).every(([key, value]) => row[key as keyof Row] === value),
          ) ?? null
        );
      },
    });
    const roomGuards = createRoomGuards({
      prisma: {
        store: find('store', rows.stores ?? []),
        courier: find('courier', rows.couriers ?? []),
        // Anybody can save an address in any city: if the guard looked here it would find one.
        address: {
          async findFirst({ where }: { where: Record<string, unknown> }) {
            asked.push({ table: 'address', where });
            return { id: 'addr-1', ...where };
          },
        },
      } as never,
      orders: {} as never,
    });
    return { cityInTenant: roomGuards.cityInTenant, asked };
  }

  const desk = userOf([ROLE.ADMIN], 't1') as never;

  it('counts a stall of the tenant in the city', async () => {
    const { cityInTenant } = guards({
      stores: [{ id: 'store-1', tenantId: 't1', cityId: 'city-urgench' }],
    });
    expect(await cityInTenant('city-urgench', desk)).toBe(true);
  });

  it('counts a courier of the tenant in the city', async () => {
    const { cityInTenant } = guards({
      couriers: [{ id: 'courier-1', tenantId: 't1', cityId: 'city-bukhara' }],
    });
    expect(await cityInTenant('city-bukhara', desk)).toBe(true);
  });

  it('does not count a saved customer address, and never asks the address table', async () => {
    const { cityInTenant, asked } = guards({});
    expect(await cityInTenant('city-khiva', desk)).toBe(false);
    expect(asked.filter((query) => query.table === 'address')).toEqual([]);
  });

  it('does not count a stall or a courier of another tenant', async () => {
    const { cityInTenant } = guards({
      stores: [{ id: 'store-9', tenantId: 't2', cityId: 'city-khiva' }],
      couriers: [{ id: 'courier-9', tenantId: 't2', cityId: 'city-bukhara' }],
    });
    expect(await cityInTenant('city-khiva', desk)).toBe(false);
    expect(await cityInTenant('city-bukhara', desk)).toBe(false);
    // The other tenant's own desk does have business there.
    expect(await cityInTenant('city-khiva', userOf([ROLE.ADMIN], 't2') as never)).toBe(true);
    expect(await cityInTenant('city-bukhara', userOf([ROLE.ADMIN], 't2') as never)).toBe(true);
  });

  it('does not count a stall or a courier of the tenant in another city', async () => {
    const { cityInTenant } = guards({
      stores: [{ id: 'store-1', tenantId: 't1', cityId: 'city-urgench' }],
      couriers: [{ id: 'courier-1', tenantId: 't1', cityId: 'city-urgench' }],
    });
    expect(await cityInTenant('city-nowhere', desk)).toBe(false);
  });

  it('asks for the tenant and the city together, of stalls and of couriers', async () => {
    const { cityInTenant, asked } = guards({});
    await cityInTenant('city-urgench', desk);
    expect(asked.sort((a, b) => a.table.localeCompare(b.table))).toEqual([
      { table: 'courier', where: { tenantId: 't1', cityId: 'city-urgench' } },
      { table: 'store', where: { tenantId: 't1', cityId: 'city-urgench' } },
    ]);
  });
});
