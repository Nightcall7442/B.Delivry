/**
 * The delivery module: who may take a trip, who may drive it forward, and who may read it.
 *
 * An accept needed only that the courier had ever been offered the order (declined and expired
 * offers included); the desk could assign any id, from any tenant, suspended or unverified; a trip
 * could be completed twice (paid twice), stepped back after it was delivered, or completed after the
 * customer cancelled; and a role with `delivery:read` but no courier profile listed every trip.
 */
import { effectivePermissions } from '@bazar/auth';
import {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_METHOD,
  TERMINAL_ORDER_STATUSES,
  type OrderStatus,
} from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ERROR_CODE } from '../../src/common/errors/error-codes.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
} from '../../src/common/errors/index.js';
import { getContext, runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { DeliveryRepository } from '../../src/modules/delivery/repository/delivery.repository.js';
import {
  completeDeliverySchema,
  failDeliverySchema,
} from '../../src/modules/delivery/schemas/index.js';
import { DeliveryService } from '../../src/modules/delivery/service/delivery.service.js';

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}-${Object.values(ids).join('-')}`,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...ids,
    },
  }) as never;

const asCourier = as(['COURIER'], { courierId: 'courier-1' });
const asOtherCourier = as(['COURIER'], { courierId: 'courier-2' });
// delivery:read without a courier profile: the role is held, the identity is not.
const asProfilelessCourier = as(['COURIER']);
const asOperator = as(['OPERATOR']);
const asAdmin = as(['ADMIN']);
const asCustomer = as(['CUSTOMER'], { customerId: 'cust-1' });
const asStallVendor = as(['VENDOR'], { vendorId: 'vendor-stall' });

const NOW = Date.now();
type Status = string;

interface World {
  delivery: Record<string, unknown> & { status: Status; courierId: string | null };
  order: { status: OrderStatus; courierId: string | null } & Record<string, unknown>;
  offer: Record<string, unknown> | null;
  courier: Record<string, unknown> | null;
  carrying: unknown[];
  lockHeld: boolean;
}

function world(over: Partial<World> = {}): World {
  return {
    delivery: {
      id: 'd1',
      tenantId: 't1',
      orderId: 'o1',
      courierId: 'courier-1',
      status: 'AT_DROPOFF',
      proofType: 'NONE',
      handoverCode: null,
      payout: 12_000,
      currency: 'UZS',
      assignedAt: new Date(NOW - 600_000),
    },
    order: {
      id: 'o1',
      number: 'BZ-1',
      tenantId: 't1',
      customerId: 'cust-1',
      status: ORDER_STATUS.COURIER_ARRIVED,
      courierId: 'courier-1',
      paymentMethod: PAYMENT_METHOD.CASH,
      total: 50_000,
      groupId: null,
      store: { vendorId: 'vendor-stall', name: { ru: 'Стол' } },
      // The order read carries the buyer's login (ORDER_INCLUDE), so a courier can be compared to it.
      customer: { id: 'cust-1', userId: 'user-customer-1' },
      items: [],
    },
    offer: null,
    courier: {
      id: 'courier-1',
      userId: 'user-courier-1',
      status: 'ONLINE',
      verifiedAt: new Date('2026-08-01'),
      maxConcurrentOrders: 1,
    },
    carrying: [],
    lockHeld: false,
    ...over,
  };
}

function service(w: World, groupOrders: unknown[] = []) {
  const log: string[] = [];
  const published: string[] = [];
  const orderMoves: { to: OrderStatus; actor: string }[] = [];
  const repository = {
    async findById(id: string) {
      return id === w.delivery.id ? w.delivery : null;
    },
    async findCourier(id: string) {
      return w.courier !== null && w.courier.id === id ? w.courier : null;
    },
    async findOffer() {
      return w.offer;
    },
    async offeredCourierIds() {
      return w.offer === null ? [] : ['courier-1'];
    },
    async activeForCourier() {
      return w.carrying;
    },
    async claim(id: string, courierId: string) {
      log.push(`claim:${id}:${courierId}`);
      if (w.delivery.courierId !== null) return false;
      w.delivery.courierId = courierId;
      w.delivery.status = 'ASSIGNED';
      return true;
    },
    async recordOffer(id: string, courierId: string) {
      log.push(`recordOffer:${id}:${courierId}`);
    },
    async setHandoverCode() {},
    async decline(id: string, courierId: string) {
      log.push(`decline:${id}:${courierId}`);
    },
    async clearOffers() {
      log.push('clearOffers');
    },
    async release(id: string, courierId: string) {
      log.push(`release:${id}:${courierId}`);
      return true;
    },
    async transition(
      id: string,
      courierId: string,
      from: readonly string[],
      status: string,
      extra: Record<string, unknown>,
    ) {
      log.push(`transition:${status}`);
      if (w.delivery.courierId !== courierId || !from.includes(w.delivery.status)) return false;
      Object.assign(w.delivery, extra, { status });
      return true;
    },
  };
  const orders = {
    async get() {
      return w.order;
    },
    async changeStatus(_id: string, to: OrderStatus, actor: string) {
      if (!ORDER_STATUS_TRANSITIONS[w.order.status].includes(to)) {
        throw new InvalidStateTransitionError(w.order.status, to);
      }
      orderMoves.push({ to, actor });
      w.order.status = to;
      return w.order;
    },
    async assignCourier(_id: string, courierId: string) {
      log.push(`assignCourier:${courierId}`);
      w.order.courierId = courierId;
    },
    async releaseCourier() {
      log.push('releaseCourier');
      w.order.courierId = null;
    },
    async group() {
      return groupOrders;
    },
    weightOf: () => 1000,
  };
  const svc = new DeliveryService({
    repository,
    orders,
    pricing: {},
    lock: {
      async withLock(_name: string, _ttl: number, fn: () => unknown) {
        return w.lockHeld ? null : fn();
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: {
      async publish(event: { name: string }) {
        published.push(event.name);
      },
    },
  } as never);
  // The fakes are handed back so that a test can make one read go stale (see `successively`).
  return { svc, log, published, orderMoves, repository, orders };
}

/** A read that answers differently each time it is asked, then keeps giving the last answer. */
function successively<T>(...answers: T[]): () => Promise<T> {
  let asked = 0;
  return async () => answers[Math.min(asked++, answers.length - 1)] as T;
}

const open = (over: Record<string, unknown> = {}) => ({
  deliveryId: 'd1',
  courierId: 'courier-1',
  acceptedAt: null,
  declinedAt: null,
  expiresAt: new Date(NOW + 20_000),
  ...over,
});

const waiting = (over: Partial<World> = {}) =>
  world({
    delivery: { ...world().delivery, courierId: null, status: 'SEARCHING', assignedAt: null },
    order: { ...world().order, status: ORDER_STATUS.SEARCHING_COURIER, courierId: null },
    offer: open(),
    ...over,
  });

describe('accepting an offer', () => {
  it('takes the trip when the offer is open', async () => {
    const w = waiting();
    const { svc, log, published } = service(w);
    const taken = await runWithContext(asCourier, () => svc.accept('d1'));
    expect(taken.courierId).toBe('courier-1');
    expect(log).toContain('claim:d1:courier-1');
    expect(log).toContain('assignCourier:courier-1');
    expect(w.order.status).toBe(ORDER_STATUS.COURIER_ASSIGNED);
    expect(published).toContain('delivery.courier_assigned');
  });

  it('takes the leader’s confirmed siblings along as the platform: the courier cannot read them yet', async () => {
    const w = waiting({ order: { ...waiting().order, groupId: 'g1' } });
    const siblings = [
      w.order,
      { id: 'o2', courierId: null, status: ORDER_STATUS.CONFIRMED },
      { id: 'o3', courierId: null, status: ORDER_STATUS.CANCELLED },
      { id: 'o4', courierId: 'courier-9', status: ORDER_STATUS.CONFIRMED },
    ];
    const { svc } = service(w, siblings);
    const followed: { id: string; system: boolean | undefined }[] = [];
    (svc as unknown as { assignSibling: unknown }).assignSibling = async (id: string) => {
      followed.push({ id, system: getContext()?.system });
    };
    await runWithContext(asCourier, () => svc.accept('d1'));
    expect(followed).toEqual([{ id: 'o2', system: true }]);
  });

  it('still lands a moment after the offer ran out: the tap was already on the wire', async () => {
    const w = waiting({ offer: open({ expiresAt: new Date(NOW - 1_000) }) });
    const { svc } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).resolves.toBeDefined();
  });

  it('is refused on an offer that was never made, was declined, has expired, or was used', async () => {
    const offers = [
      null,
      open({ declinedAt: new Date(NOW - 5_000) }),
      open({ expiresAt: new Date(NOW - 60_000) }),
      open({ acceptedAt: new Date(NOW - 5_000) }),
    ];
    for (const offer of offers) {
      const w = waiting({ offer });
      const { svc, log } = service(w);
      await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toMatchObject({
        code: ERROR_CODE.OFFER_EXPIRED,
      });
      expect(log.filter((entry) => entry.startsWith('claim'))).toEqual([]);
    }
  });

  it('answers a retry of an accept that already went through with the trip, changing nothing', async () => {
    const w = world({
      offer: open({ acceptedAt: new Date(NOW - 5_000) }),
      delivery: { ...world().delivery, status: 'ASSIGNED' },
      order: { ...world().order, status: ORDER_STATUS.COURIER_ASSIGNED },
    });
    const { svc, log, published } = service(w);
    const again = await runWithContext(asCourier, () => svc.accept('d1'));
    expect(again.courierId).toBe('courier-1');
    expect(log).toEqual([]);
    expect(published).toEqual([]);
  });

  it('is refused to a courier who is suspended, unverified or off shift', async () => {
    const standings = [
      [{ status: 'SUSPENDED', verifiedAt: new Date('2026-08-01') }, ForbiddenError],
      [{ status: 'ONLINE', verifiedAt: null }, ForbiddenError],
      [{ status: 'OFFLINE', verifiedAt: new Date('2026-08-01') }, ConflictError],
    ] as const;
    for (const [standing, error] of standings) {
      const w = waiting({ courier: { ...world().courier, ...standing } });
      const { svc, log } = service(w);
      await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toBeInstanceOf(error);
      expect(log).toEqual([]);
    }
  });

  it('is refused when the order was cancelled while the offer was open', async () => {
    const w = waiting({ order: { ...waiting().order, status: ORDER_STATUS.CANCELLED } });
    const { svc, log } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(log).toEqual([]);
  });

  it('is refused to a courier already carrying as many orders as they take', async () => {
    const w = waiting({ carrying: [{ id: 'd0' }] });
    const { svc, log } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toMatchObject({
      code: ERROR_CODE.COURIER_BUSY,
    });
    expect(log).toEqual([]);
  });

  it('is busy, not silent, when another request holds the trip', async () => {
    const w = waiting({ lockHeld: true });
    const { svc } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toMatchObject({
      code: ERROR_CODE.COURIER_BUSY,
    });
  });

  it('is refused to a courier on their own order: a neighbour who also shops is not paid to carry it', async () => {
    // The same person holds the courier profile and the customer one: two profiles, one login.
    const w = waiting({
      courier: { ...world().courier, userId: 'user-both' },
      order: { ...waiting().order, customer: { id: 'cust-9', userId: 'user-both' } },
    });
    const { svc, log, published, orderMoves } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    // Refused before the claim: nobody is on the trip, the order, or the books.
    expect(log).toEqual([]);
    expect(published).toEqual([]);
    expect(orderMoves).toEqual([]);
    expect(w.delivery.courierId).toBeNull();
    expect(w.order.courierId).toBeNull();
    expect(w.order.status).toBe(ORDER_STATUS.SEARCHING_COURIER);
  });

  it('is not refused to a courier whose login merely resembles the buyer’s', async () => {
    const w = waiting({
      courier: { ...world().courier, userId: 'user-7' },
      order: { ...waiting().order, customer: { id: 'cust-9', userId: 'user-70' } },
    });
    const { svc, log } = service(w);
    await expect(runWithContext(asCourier, () => svc.accept('d1'))).resolves.toMatchObject({
      courierId: 'courier-1',
    });
    expect(log).toContain('claim:d1:courier-1');
  });
});

describe('the desk assigning a courier', () => {
  it('hands the trip to a verified courier who is online, or busy on another trip', async () => {
    for (const status of ['ONLINE', 'BUSY']) {
      const w = waiting({ offer: null, courier: { ...world().courier, status } });
      const { svc, log } = service(w);
      await runWithContext(asOperator, () => svc.assign('d1', 'courier-1'));
      expect(log).toContain('claim:d1:courier-1');
    }
  });

  it('refuses a courier who is not of this tenant: the id is not a courier here', async () => {
    const w = waiting({ offer: null, courier: null });
    const { svc, log } = service(w);
    await expect(
      runWithContext(asOperator, () => svc.assign('d1', 'a-courier-of-another-tenant')),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(log).toEqual([]);
  });

  it('refuses a courier who is suspended, unverified or off shift', async () => {
    const standings = [
      { status: 'SUSPENDED', verifiedAt: new Date('2026-08-01') },
      { status: 'ONLINE', verifiedAt: null },
      { status: 'OFFLINE', verifiedAt: new Date('2026-08-01') },
    ];
    for (const standing of standings) {
      const w = waiting({ offer: null, courier: { ...world().courier, ...standing } });
      const { svc, log } = service(w);
      await expect(
        runWithContext(asAdmin, () => svc.assign('d1', 'courier-1')),
      ).rejects.toBeDefined();
      expect(log).toEqual([]);
    }
  });

  it('refuses an order that has moved on', async () => {
    for (const status of [ORDER_STATUS.CANCELLED, ORDER_STATUS.DELIVERED, ORDER_STATUS.PICKED_UP]) {
      const w = waiting({ offer: null, order: { ...waiting().order, status } });
      const { svc, log } = service(w);
      await expect(
        runWithContext(asOperator, () => svc.assign('d1', 'courier-1')),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(log).toEqual([]);
    }
  });

  it('refuses a courier who is the order’s own customer, whoever at the desk names them', async () => {
    for (const status of ['ONLINE', 'BUSY']) {
      const w = waiting({
        offer: null,
        courier: { ...world().courier, status, userId: 'user-both' },
        order: { ...waiting().order, customer: { id: 'cust-9', userId: 'user-both' } },
      });
      const { svc, log, published, orderMoves } = service(w);
      for (const who of [asOperator, asAdmin]) {
        await expect(
          runWithContext(who, () => svc.assign('d1', 'courier-1')),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      // Not even an offer row is written: the refusal comes before the claim.
      expect(log).toEqual([]);
      expect(published).toEqual([]);
      expect(orderMoves).toEqual([]);
      expect(w.delivery.courierId).toBeNull();
    }
  });

  it('hands the order to a courier who is somebody else’s login than the buyer’s', async () => {
    const w = waiting({
      offer: null,
      courier: { ...world().courier, userId: 'user-7' },
      order: { ...waiting().order, customer: { id: 'cust-9', userId: 'user-70' } },
    });
    const { svc, log } = service(w);
    await runWithContext(asOperator, () => svc.assign('d1', 'courier-1'));
    expect(log).toContain('claim:d1:courier-1');
    expect(w.delivery.courierId).toBe('courier-1');
  });

  it('is the desk’s alone', async () => {
    for (const who of [asCourier, asCustomer, asStallVendor]) {
      const { svc, log } = service(waiting({ offer: null }));
      await expect(runWithContext(who, () => svc.assign('d1', 'courier-1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(log).toEqual([]);
    }
  });
});

describe('releasing and restarting', () => {
  const assigned = (status: OrderStatus) =>
    world({
      delivery: { ...world().delivery, status: 'ASSIGNED' },
      order: { ...world().order, status },
    });

  it('release is the desk’s: the service asks for it itself, not only the route', async () => {
    for (const who of [asCourier, asCustomer, asStallVendor]) {
      const { svc, log } = service(assigned(ORDER_STATUS.COURIER_ASSIGNED));
      await expect(
        runWithContext(who, () => svc.release('d1', 'Курьер пропал')),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(log).toEqual([]);
    }
  });

  it('puts the order back on the market while the courier has no goods yet', async () => {
    for (const status of [ORDER_STATUS.COURIER_ASSIGNED, ORDER_STATUS.COURIER_ARRIVED_PICKUP]) {
      const w = assigned(status);
      const { svc, log, published } = service(w);
      await runWithContext(asOperator, () => svc.release('d1', 'Курьер пропал'));
      expect(log).toEqual(['release:d1:courier-1', 'releaseCourier']);
      expect(w.order.status).toBe(ORDER_STATUS.SEARCHING_COURIER);
      expect(published).toContain('delivery.courier_released');
    }
  });

  it('refuses before resetting anything when the order cannot go back to the search', async () => {
    for (const status of [
      ORDER_STATUS.PICKING_UP,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.IN_DELIVERY,
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
    ]) {
      const { svc, log } = service(assigned(status));
      await expect(
        runWithContext(asOperator, () => svc.release('d1', 'Курьер пропал')),
      ).rejects.toBeInstanceOf(InvalidStateTransitionError);
      // Nothing reset: the courier is still on the delivery and on the order.
      expect(log).toEqual([]);
    }
  });

  it('restarts a search only for an order still waiting for a courier', async () => {
    const closed = waiting({
      offer: null,
      order: { ...waiting().order, status: ORDER_STATUS.CANCELLED },
    });
    const { svc, log } = service(closed);
    await expect(runWithContext(asOperator, () => svc.restartSearch('d1'))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(log).toEqual([]);

    const live = service(waiting({ offer: null }));
    await runWithContext(asOperator, () => live.svc.restartSearch('d1'));
    expect(live.log).toEqual(['clearOffers']);
  });
});

describe('driving a trip forward', () => {
  it('completes once: a second tap changes nothing and pays nothing', async () => {
    const w = world();
    const { svc, published } = service(w);
    await runWithContext(asCourier, () => svc.complete('d1', {}));
    await runWithContext(asCourier, () => svc.complete('d1', {}));
    expect(published.filter((name) => name === 'delivery.delivered')).toHaveLength(1);
    expect(w.delivery.status).toBe('DELIVERED');
    expect(w.order.status).toBe(ORDER_STATUS.DELIVERED);
  });

  it('answers a retry of a completed handover with the trip, even without the code the first one carried', async () => {
    const w = world({
      delivery: {
        ...world().delivery,
        status: 'DELIVERED',
        proofType: 'CODE',
        handoverCode: '4821',
      },
      order: { ...world().order, status: ORDER_STATUS.DELIVERED },
    });
    const { svc, published } = service(w);
    await expect(runWithContext(asCourier, () => svc.complete('d1', {}))).resolves.toMatchObject({
      status: 'DELIVERED',
    });
    expect(published).toEqual([]);
  });

  it('checks the handover code before anything moves, when the trip asks for one', async () => {
    const w = world({ delivery: { ...world().delivery, proofType: 'CODE', handoverCode: '4821' } });
    const { svc, log, published } = service(w);
    await expect(
      runWithContext(asCourier, () => svc.complete('d1', { handoverCode: '0000' })),
    ).rejects.toMatchObject({ code: ERROR_CODE.INVALID_HANDOVER_CODE });
    expect(log).toEqual([]);
    expect(published).toEqual([]);
    await runWithContext(asCourier, () => svc.complete('d1', { handoverCode: '4821' }));
    expect(w.delivery.status).toBe('DELIVERED');
  });

  it('never steps a live trip back to an earlier stage', async () => {
    const w = world();
    const { svc, log, orderMoves } = service(w);
    for (const step of [svc.arrivedAtPickup, svc.pickedUp]) {
      await expect(runWithContext(asCourier, () => step.call(svc, 'd1'))).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    expect(w.delivery.status).toBe('AT_DROPOFF');
    expect(log).toEqual([]);
    expect(orderMoves).toEqual([]);
  });

  it('is not paid for an order the customer cancelled while the courier was on the way', async () => {
    const w = world({ order: { ...world().order, status: ORDER_STATUS.CANCELLED } });
    const { svc, published } = service(w);
    await expect(runWithContext(asCourier, () => svc.complete('d1', {}))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(published).toEqual([]);
    expect(w.delivery.status).toBe('AT_DROPOFF');
  });

  it('cannot step back after it has ended', async () => {
    const w = world({
      delivery: { ...world().delivery, status: 'DELIVERED' },
      order: { ...world().order, status: ORDER_STATUS.DELIVERED },
    });
    const { svc, log } = service(w);
    for (const step of [svc.arrivedAtPickup, svc.pickedUp, svc.arrivedAtDropoff]) {
      await expect(runWithContext(asCourier, () => step.call(svc, 'd1'))).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    await expect(
      runWithContext(asCourier, () => svc.fail('d1', 'Передумали')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(w.delivery.status).toBe('DELIVERED');
    expect(log).toEqual([]);
  });

  it('walks the order forward with the trip, and a repeated tap is a no-op', async () => {
    const w = world({
      delivery: { ...world().delivery, status: 'ASSIGNED' },
      order: { ...world().order, status: ORDER_STATUS.COURIER_ASSIGNED },
    });
    const { svc, orderMoves, published } = service(w);
    await runWithContext(asCourier, () => svc.arrivedAtPickup('d1'));
    await runWithContext(asCourier, () => svc.arrivedAtPickup('d1'));
    expect(w.delivery.status).toBe('AT_PICKUP');
    expect(orderMoves.map((move) => move.to)).toEqual([ORDER_STATUS.COURIER_ARRIVED_PICKUP]);
    // Arriving at the stall tells nobody anything: no event, on the first tap or the second.
    expect(published).toEqual([]);

    // The first tap is the one that announces it; the second changes nothing and says nothing.
    await runWithContext(asCourier, () => svc.pickedUp('d1'));
    expect(published).toEqual(['delivery.picked_up']);
    const movesAfterFirst = orderMoves.length;
    await runWithContext(asCourier, () => svc.pickedUp('d1'));
    expect(published).toEqual(['delivery.picked_up']);
    expect(orderMoves).toHaveLength(movesAfterFirst);
    expect(w.delivery.status).toBe('PICKED_UP');
    expect(w.order.status).toBe(ORDER_STATUS.IN_DELIVERY);

    // Same at the door: the "come down" nudge goes out once.
    await runWithContext(asCourier, () => svc.arrivedAtDropoff('d1'));
    expect(published).toEqual(['delivery.picked_up', 'delivery.arrived_dropoff']);
    await runWithContext(asCourier, () => svc.arrivedAtDropoff('d1'));
    expect(published).toEqual(['delivery.picked_up', 'delivery.arrived_dropoff']);
    expect(w.delivery.status).toBe('AT_DROPOFF');
    expect(w.order.status).toBe(ORDER_STATUS.COURIER_ARRIVED);
  });

  it('is the assigned courier’s: another courier, or none, moves nothing', async () => {
    for (const who of [asOtherCourier, asProfilelessCourier]) {
      const w = world();
      const { svc, log } = service(w);
      for (const call of [
        () => svc.arrivedAtPickup('d1'),
        () => svc.pickedUp('d1'),
        () => svc.arrivedAtDropoff('d1'),
        () => svc.complete('d1', {}),
        () => svc.fail('d1', 'Нет товара'),
      ]) {
        await expect(runWithContext(who, call)).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(log).toEqual([]);
      expect(w.delivery.status).toBe('AT_DROPOFF');
    }
  });

  it('does not say a delivery exists to a caller with no courier profile', async () => {
    const { svc } = service(world());
    // Same refusal for a real id and an invented one.
    for (const id of ['d1', 'nope']) {
      await expect(
        runWithContext(asProfilelessCourier, () => svc.complete(id, {})),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('fails an order only where the order may be failed, and leaves the delivery alone when it may not', async () => {
    // A trip whose order is somewhere the table has no way to FAILED from (it was never confirmed).
    const w = world({
      delivery: { ...world().delivery, status: 'ASSIGNED' },
      order: { ...world().order, status: ORDER_STATUS.CONFIRMED },
    });
    const { svc, log, published } = service(w);
    await expect(
      runWithContext(asCourier, () => svc.fail('d1', 'Рынок закрыт')),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(w.delivery.status).toBe('ASSIGNED');
    expect(log).toEqual([]);
    expect(published).toEqual([]);
  });

  it('fails from the way to the stall and from the stall: the order is walked to where it may fail', async () => {
    for (const [delivery, order, walked] of [
      [
        'ASSIGNED',
        ORDER_STATUS.COURIER_ASSIGNED,
        [ORDER_STATUS.COURIER_ARRIVED_PICKUP, ORDER_STATUS.PICKING_UP, ORDER_STATUS.FAILED],
      ],
      [
        'AT_PICKUP',
        ORDER_STATUS.COURIER_ARRIVED_PICKUP,
        [ORDER_STATUS.PICKING_UP, ORDER_STATUS.FAILED],
      ],
      ['PICKED_UP', ORDER_STATUS.PICKED_UP, [ORDER_STATUS.FAILED]],
    ] as const) {
      const w = world({
        delivery: { ...world().delivery, status: delivery },
        order: { ...world().order, status: order },
      });
      const { svc, orderMoves, published } = service(w);
      const failed = await runWithContext(asCourier, () => svc.fail('d1', 'Товара нет'));
      expect(orderMoves.map((move) => move.to)).toEqual(walked);
      expect(failed.status).toBe('FAILED');
      expect(published).toEqual(['delivery.failed']);

      // Twice is once.
      await runWithContext(asCourier, () => svc.fail('d1', 'Товара нет'));
      expect(published).toEqual(['delivery.failed']);
    }
  });

  it('every terminal order status ends the trip for the courier', async () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      const w = world({
        delivery: { ...world().delivery, status: 'PICKED_UP' },
        order: { ...world().order, status },
      });
      const { svc, published } = service(w);
      await expect(
        runWithContext(asCourier, () => svc.arrivedAtDropoff('d1')),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(published).toEqual([]);
    }
  });
});

describe('a trip that changes under the courier while the request is in flight', () => {
  // A retry of a completion that went through while this one was between its reads.
  const delivered = () =>
    world({
      delivery: { ...world().delivery, status: 'DELIVERED' },
      order: { ...world().order, status: ORDER_STATUS.DELIVERED },
    });

  it('a stale read of a trip that is already delivered is not completed again, and not paid again', async () => {
    const w = delivered();
    const { svc, repository, log, published, orderMoves } = service(w);
    // The request found the trip as it was before the first completion landed.
    repository.findById = successively({ ...w.delivery, status: 'AT_DROPOFF' });

    // The order is already delivered: the closed order stops the step before anything is written.
    await expect(runWithContext(asCourier, () => svc.complete('d1', {}))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(log).toEqual([]);
    expect(orderMoves).toEqual([]);
    expect(published).toEqual([]);
  });

  it('a completion that loses the race to the first one answers with the trip and publishes nothing', async () => {
    const w = delivered();
    const { svc, repository, orders, log, published, orderMoves } = service(w);
    // Read twice: before the first completion (the trip at the door, the order not yet closed) and
    // after it (the trip delivered). The guarded update in between matches nothing.
    repository.findById = successively({ ...w.delivery, status: 'AT_DROPOFF' }, w.delivery);
    orders.get = successively({ ...w.order, status: ORDER_STATUS.COURIER_ARRIVED }, w.order);

    const answer = await runWithContext(asCourier, () => svc.complete('d1', {}));
    expect(answer).toMatchObject({ id: 'd1', status: 'DELIVERED' });
    // It tried and lost; it moved no order, and the payout was booked once, by the winner.
    expect(log).toEqual(['transition:DELIVERED']);
    expect(orderMoves).toEqual([]);
    expect(published).toEqual([]);
  });

  describe('when the guarded update on the trip matches nothing', () => {
    // The trip was at the stall when this tap read it, and is `now` by the time the update runs.
    function raced(now: Record<string, unknown>) {
      const w = world({
        delivery: { ...world().delivery, status: 'PICKED_UP', ...now },
        order: { ...world().order, status: ORDER_STATUS.COURIER_ARRIVED_PICKUP },
      });
      const harness = service(w);
      harness.repository.findById = successively(
        { ...w.delivery, status: 'AT_PICKUP', courierId: 'courier-1' },
        w.delivery,
      );
      return { w, ...harness };
    }

    it('is a no-op, with the trip, when the winner made the same step as the same courier', async () => {
      const { svc, log, published } = raced({ status: 'PICKED_UP', courierId: 'courier-1' });
      const answer = await runWithContext(asCourier, () => svc.pickedUp('d1'));
      expect(answer).toMatchObject({ status: 'PICKED_UP', courierId: 'courier-1' });
      expect(log).toEqual(['transition:PICKED_UP']);
      // The winner announced it: the loser must not say it again.
      expect(published).toEqual([]);
    });

    it('is a conflict when the trip is at that step but now another courier’s', async () => {
      const { svc, published } = raced({ status: 'PICKED_UP', courierId: 'courier-2' });
      await expect(runWithContext(asCourier, () => svc.pickedUp('d1'))).rejects.toMatchObject({
        message: expect.stringContaining('changed meanwhile'),
      });
      expect(published).toEqual([]);
    });

    it('is a conflict when the trip has moved on, was released, or failed', async () => {
      for (const now of [
        { status: 'AT_DROPOFF', courierId: 'courier-1' },
        { status: 'SEARCHING', courierId: null },
        { status: 'ASSIGNED', courierId: 'courier-2' },
        { status: 'FAILED', courierId: 'courier-1' },
      ]) {
        const { svc, log, published } = raced(now);
        const error = await runWithContext(asCourier, () => svc.pickedUp('d1')).catch(
          (thrown: unknown) => thrown,
        );
        expect(error, JSON.stringify(now)).toBeInstanceOf(ConflictError);
        expect(error).toMatchObject({ message: expect.stringContaining('changed meanwhile') });
        expect(log).toEqual(['transition:PICKED_UP']);
        expect(published).toEqual([]);
      }
    });
  });

  describe('when the order is cancelled or fails in the gap before the trip is moved', () => {
    // [what the trip says, where the order is when step() looks, how the courier taps]
    const TAPS: Record<string, [string, OrderStatus, (svc: DeliveryService) => Promise<unknown>]> =
      {
        'arrive at the stall': [
          'ASSIGNED',
          ORDER_STATUS.COURIER_ASSIGNED,
          (svc) => svc.arrivedAtPickup('d1'),
        ],
        'pick up': ['AT_PICKUP', ORDER_STATUS.COURIER_ARRIVED_PICKUP, (svc) => svc.pickedUp('d1')],
        'arrive at the door': [
          'PICKED_UP',
          ORDER_STATUS.IN_DELIVERY,
          (svc) => svc.arrivedAtDropoff('d1'),
        ],
        complete: ['AT_DROPOFF', ORDER_STATUS.COURIER_ARRIVED, (svc) => svc.complete('d1', {})],
      };

    for (const [tap, [status, orderStatus, press]] of Object.entries(TAPS)) {
      for (const closed of [ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED]) {
        it(`${closed} order: the courier cannot ${tap}, the trip is not moved and nobody is paid`, async () => {
          const w = world({
            delivery: { ...world().delivery, status },
            order: { ...world().order, status: orderStatus },
          });
          const { svc, orders, log, published, orderMoves } = service(w);
          // step() reads the order open; advanceOrder() reads it again, and now it is closed.
          orders.get = successively(
            { ...w.order, status: orderStatus },
            { ...w.order, status: closed },
          );

          const error = await runWithContext(asCourier, () => press(svc)).catch(
            (thrown: unknown) => thrown,
          );
          expect(error).toBeInstanceOf(ConflictError);
          expect(error).toMatchObject({ message: 'The order is closed' });

          // The delivery row was never touched (no guarded update was even attempted), no order
          // status was written over the closed one, and nothing was announced or paid.
          expect(log).toEqual([]);
          expect(w.delivery.status).toBe(status);
          expect(orderMoves).toEqual([]);
          expect(published).toEqual([]);
        });
      }
    }

    it('failing the trip is refused the same way, before the order or the trip is failed', async () => {
      for (const [status, orderStatus] of [
        ['ASSIGNED', ORDER_STATUS.COURIER_ASSIGNED],
        ['AT_PICKUP', ORDER_STATUS.COURIER_ARRIVED_PICKUP],
      ] as const) {
        const w = world({
          delivery: { ...world().delivery, status },
          order: { ...world().order, status: orderStatus },
        });
        const { svc, orders, log, published, orderMoves } = service(w);
        orders.get = successively(
          { ...w.order, status: orderStatus },
          { ...w.order, status: ORDER_STATUS.CANCELLED },
        );
        await expect(
          runWithContext(asCourier, () => svc.fail('d1', 'Рынок закрыт')),
        ).rejects.toMatchObject({ message: 'The order is closed' });
        expect(log).toEqual([]);
        expect(orderMoves).toEqual([]);
        expect(published).toEqual([]);
        expect(w.delivery.status).toBe(status);
      }
    });
  });
});

describe('declining an offer', () => {
  it('is the courier’s own answer, on their own offer', async () => {
    const { svc, log } = service(waiting());
    await runWithContext(asCourier, () => svc.decline('d1'));
    expect(log).toEqual(['decline:d1:courier-1']);
  });

  it('needs a courier profile', async () => {
    const { svc, log } = service(waiting());
    await expect(runWithContext(asCustomer, () => svc.decline('d1'))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(log).toEqual([]);
  });
});

describe('reading deliveries', () => {
  const repoWith = () => {
    const queries: Record<string, unknown>[] = [];
    const w = world();
    const harness = service(w);
    // The list goes to the repository: record what it was asked.
    (harness.svc as unknown as { repository: { list: unknown } }).repository.list = async (
      filters: Record<string, unknown>,
    ) => {
      queries.push(filters);
      return { items: [], total: 0 };
    };
    return { ...harness, queries };
  };

  it('lists a courier’s own trips, whatever they filtered by', async () => {
    const { svc, queries } = repoWith();
    await runWithContext(asCourier, () =>
      svc.list({ courierId: 'courier-2', status: 'DELIVERED' }),
    );
    expect(queries[0]).toMatchObject({ courierId: 'courier-1', status: 'DELIVERED' });
  });

  it('lists the tenant’s trips to the desk only', async () => {
    for (const who of [asOperator, asAdmin]) {
      const { svc, queries } = repoWith();
      await runWithContext(who, () => svc.list({ courierId: 'courier-2' }));
      expect(queries[0]).toEqual({ courierId: 'courier-2' });
    }
  });

  it('lists nothing to a courier role with no courier profile, and nothing to anyone else', async () => {
    for (const who of [asProfilelessCourier, asCustomer, asStallVendor]) {
      const { svc, queries } = repoWith();
      await expect(runWithContext(who, () => svc.list({}))).rejects.toBeInstanceOf(ForbiddenError);
      expect(queries).toEqual([]);
    }
  });

  it('shows a trip to its courier and to the desk, and to nobody else — a stall never sees a door', async () => {
    for (const who of [asCourier, asOperator, asAdmin]) {
      const { svc } = service(world());
      await expect(runWithContext(who, () => svc.get('d1'))).resolves.toMatchObject({ id: 'd1' });
    }
    for (const who of [asOtherCourier, asProfilelessCourier, asCustomer, asStallVendor]) {
      const { svc } = service(world());
      await expect(runWithContext(who, () => svc.get('d1'))).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe('proof photos', () => {
  it('are web addresses: a script or a data URL is not a photo', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd']) {
      expect(completeDeliverySchema.safeParse({ proofUrl: url }).success).toBe(false);
      expect(failDeliverySchema.safeParse({ reason: 'Нет товара', photoUrl: url }).success).toBe(
        false,
      );
    }
    expect(completeDeliverySchema.safeParse({ proofUrl: 'https://cdn.test/p.jpg' }).success).toBe(
      true,
    );
    expect(completeDeliverySchema.safeParse({}).success).toBe(true);
  });
});

describe('DeliveryRepository', () => {
  function repository() {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const record = (fn: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return result;
    };
    const prisma = {
      courier: {
        findMany: record('courier.findMany', []),
        findFirst: record('courier.findFirst', null),
      },
      delivery: {
        findMany: record('delivery.findMany', []),
        updateMany: record('delivery.updateMany', { count: 1 }),
      },
      deliveryOffer: {
        findFirst: record('deliveryOffer.findFirst', null),
        updateMany: record('deliveryOffer.updateMany', { count: 1 }),
        deleteMany: record('deliveryOffer.deleteMany', { count: 1 }),
      },
    };
    return { repo: new DeliveryRepository(prisma as never), calls };
  }
  const inTenant = <T>(fn: () => T) => runWithContext(asCourier, fn);

  it('offers work only to verified, online couriers, and counts only trips whose order is still open', async () => {
    const { repo, calls } = repository();
    await inTenant(() => repo.findCandidates({ lat: 41.55, lng: 60.63 }, 1500, 'city'));
    const { where, select } = calls[0]!.args as {
      where: Record<string, unknown>;
      select: { _count: { select: { deliveries: { where: Record<string, unknown> } } } };
    };
    expect(where).toMatchObject({
      tenantId: 't1',
      status: 'ONLINE',
      verifiedAt: { not: null },
    });
    expect(select._count.select.deliveries.where).toMatchObject({
      order: { status: { notIn: [...TERMINAL_ORDER_STATUSES] } },
    });
  });

  it('does not keep a courier busy with a trip whose order was cancelled under them', async () => {
    const { repo, calls } = repository();
    await inTenant(() => repo.activeForCourier('courier-1'));
    expect(calls[0]!.args.where).toMatchObject({
      tenantId: 't1',
      courierId: 'courier-1',
      order: { status: { notIn: [...TERMINAL_ORDER_STATUSES] } },
    });
  });

  it('finds a courier in this tenant only', async () => {
    const { repo, calls } = repository();
    await inTenant(() => repo.findCourier('c9'));
    expect(calls[0]!.args.where).toEqual({ id: 'c9', tenantId: 't1' });
  });

  it('moves a trip only from the statuses named, while it is still the courier’s, in this tenant', async () => {
    const { repo, calls } = repository();
    await expect(
      inTenant(() => repo.transition('d1', 'courier-1', ['ASSIGNED'], 'AT_PICKUP')),
    ).resolves.toBe(true);
    expect(calls[0]!.args).toMatchObject({
      where: { id: 'd1', tenantId: 't1', courierId: 'courier-1', status: { in: ['ASSIGNED'] } },
      data: { status: 'AT_PICKUP' },
    });
  });

  it('claims and releases inside the tenant, and releases only the courier’s own live trip', async () => {
    const { repo, calls } = repository();
    await inTenant(() => repo.claim('d1', 'courier-1'));
    expect(calls[0]!.args.where).toMatchObject({ id: 'd1', tenantId: 't1', courierId: null });
    await inTenant(() => repo.release('d1', 'courier-1'));
    expect(calls[2]!.args.where).toMatchObject({
      id: 'd1',
      tenantId: 't1',
      courierId: 'courier-1',
      status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF'] },
    });
  });

  it('declines only an offer still open, on a delivery of this tenant', async () => {
    const { repo, calls } = repository();
    await inTenant(() => repo.decline('d1', 'courier-1'));
    expect(calls[0]!.args.where).toEqual({
      deliveryId: 'd1',
      courierId: 'courier-1',
      acceptedAt: null,
      delivery: { tenantId: 't1' },
    });
  });
});
