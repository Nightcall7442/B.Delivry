/**
 * Tracking business logic. Live courier location ingestion, ETA, order tracking feed.
 */
import {
  DELIVERY_TIMEOUTS,
  ORDER_STATUS,
  PERMISSION,
  isTerminalOrderStatus,
  type OrderStatus,
  type VehicleType,
} from '@bazar/constants';
import { WS_EVENT } from '@bazar/types';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/domain.errors.js';
import type { RealtimePublisher } from '../../../infrastructure/redis/realtime-events.js';
import { room } from '../../../websocket/rooms.js';
import type { DeliveryService } from '../../delivery/service/delivery.service.js';
import { isStallOnlyView, standingOn } from '../../orders/domain/order-party.js';
import type { OrdersService } from '../../orders/service/orders.service.js';
import { RouteEtaCalculator, type EtaCalculator } from '../domain/eta.calculator.js';
import type { TrackingRepository } from '../repository/tracking.repository.js';
import type { HistoryFilters, LocationPing, TrackingView } from '../types/index.js';

export interface TrackingServiceDeps extends ServiceDeps {
  repository: TrackingRepository;
  orders: OrdersService;
  delivery: DeliveryService;
  realtime: RealtimePublisher;
  eta: EtaCalculator;
}

export class TrackingService extends BaseService {
  private readonly repository: TrackingRepository;
  private readonly orders: OrdersService;
  private readonly delivery: DeliveryService;
  private readonly realtime: RealtimePublisher;
  private readonly eta: EtaCalculator;

  constructor(deps: TrackingServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.orders = deps.orders;
    this.delivery = deps.delivery;
    this.realtime = deps.realtime;
    this.eta = deps.eta;
  }

  /**
   * Ingests location pings from a courier device.
   *
   * Broadcast first, persist second: the customer watching the map cares about
   * latency, and the history table is for disputes later. Pings closer together
   * than the minimum interval are dropped, because a phone reporting every
   * second would write millions of rows a day for no extra accuracy.
   *
   * Nothing in a ping is believed. The courier is who the token says; the position and the clock
   * are bounded; and the order id is only a claim: the position goes into an order's room (the
   * customer's map) only if that order is carried by THIS courier and is still open. Otherwise it
   * reaches the courier's own room alone, as if no order had been named.
   */
  async push(pings: LocationPing[]): Promise<void> {
    const courierId = this.requireCourierId();
    const now = new Date();

    const usable = pings
      .slice(-MAX_PINGS_PER_PUSH)
      .map((ping) => normalizePing(ping, now))
      .filter((ping): ping is LocationPing => ping !== null);
    const filtered = thinOut(usable, DELIVERY_TIMEOUTS.LOCATION_MIN_INTERVAL_SECONDS);
    const latest = filtered[filtered.length - 1];
    if (latest === undefined) return;

    const claimed = [...new Set(filtered.flatMap((ping) => (ping.orderId ? [ping.orderId] : [])))];
    const carried = await this.repository.ordersOfCourier(courierId, claimed);

    // A backlog uploaded after the drop-off still belongs to that order's trace, so the history
    // keeps the tag of any order this courier carried; the live room wants an order still open.
    const rows = filtered.map((ping) => ({
      ...ping,
      orderId: ping.orderId !== undefined && carried.has(ping.orderId) ? ping.orderId : undefined,
    }));
    const status = latest.orderId === undefined ? undefined : carried.get(latest.orderId);
    const orderId =
      latest.orderId !== undefined && status !== undefined && !isTerminalOrderStatus(status)
        ? latest.orderId
        : null;

    await this.realtime.emitToRooms(
      orderId === null ? [room.courier(courierId)] : [room.order(orderId), room.courier(courierId)],
      WS_EVENT.COURIER_LOCATION,
      {
        orderId,
        courierId,
        point: { lat: latest.lat, lng: latest.lng },
        heading: latest.heading ?? null,
        at: latest.recordedAt.toISOString(),
      },
    );

    await this.repository.savePings(courierId, rows);
  }

  /** The live screen a customer watches while waiting. */
  async trackOrder(orderId: string): Promise<TrackingView> {
    const order = await this.orders.get(orderId);
    const view = await this.fullView(order, await this.delivery.findByOrder(orderId));
    // The stall sees the courier come to its counter; where the customer lives, and the road
    // there, are not its business (and the courier's dot past the counter would give them away).
    return isStallOnlyView(this.currentUser(), order) ? stallView(view) : view;
  }

  private async fullView(
    order: Awaited<ReturnType<OrdersService['get']>>,
    delivery: Awaited<ReturnType<DeliveryService['findByOrder']>>,
  ): Promise<TrackingView> {
    const orderId = order.id;
    // A closed order has no live courier: the courier's latest fix belongs to whatever trip they are on
    // now, and the order's owner (or an ex-customer, weeks later) must not follow it.
    const live = !isTerminalOrderStatus(order.status);
    const [courierLocation, courier] =
      order.courierId === null
        ? [null, null]
        : await Promise.all([
            live ? this.repository.lastLocation(order.courierId) : Promise.resolve(null),
            this.repository.courierProfile(order.courierId),
          ]);

    const dropoff =
      order.addressLat === null || order.addressLng === null
        ? null
        : { lat: Number(order.addressLat), lng: Number(order.addressLng) };

    const pickup =
      delivery?.pickupLat == null || delivery.pickupLng == null
        ? null
        : { lat: Number(delivery.pickupLat), lng: Number(delivery.pickupLng) };

    // No courier or no fix yet: the map shows the route, not a moving dot.
    if (courierLocation === null || dropoff === null) {
      return {
        orderId,
        status: order.status,
        courier,
        courierPoint: null,
        courierUpdatedAt: null,
        pickupPoint: pickup,
        dropoffPoint: dropoff,
        etaAt: delivery?.etaAt ?? null,
        etaSeconds: null,
        distanceMeters: delivery?.distanceMeters ?? null,
        routeGeometry: null,
      };
    }

    const estimate = await this.eta.estimate(
      { lat: courierLocation.lat, lng: courierLocation.lng },
      dropoff,
      'SCOOTER',
    );

    return {
      orderId,
      status: order.status,
      courier,
      courierPoint: { lat: courierLocation.lat, lng: courierLocation.lng },
      courierUpdatedAt: courierLocation.at,
      pickupPoint: pickup,
      dropoffPoint: dropoff,
      etaAt: estimate.arrivesAt,
      etaSeconds: estimate.seconds,
      distanceMeters: estimate.distanceMeters,
      routeGeometry: estimate.geometry,
    };
  }

  /**
   * Recomputes the ETA and pushes it to whoever is watching. Called from the
   * scheduled job while a delivery is in transit.
   */
  async refreshEta(orderId: string, vehicle: VehicleType = 'SCOOTER'): Promise<Date | null> {
    const order = await this.orders.get(orderId);
    if (order.courierId === null) return null;

    const location = await this.repository.lastLocation(order.courierId);
    if (location === null) return null;
    if (order.addressLat === null || order.addressLng === null) return null;

    const estimate = await this.eta.estimate(
      { lat: location.lat, lng: location.lng },
      { lat: Number(order.addressLat), lng: Number(order.addressLng) },
      vehicle,
    );

    await this.orders.setEta(orderId, estimate.arrivesAt);

    const delivery = await this.delivery.findByOrder(orderId);
    if (delivery !== null) await this.delivery.setEta(delivery.id, estimate.arrivesAt);

    await this.realtime.emit(room.order(orderId), WS_EVENT.ORDER_ETA_UPDATED, {
      orderId,
      etaAt: estimate.arrivesAt.toISOString(),
      etaSeconds: estimate.seconds,
    });

    return estimate.arrivesAt;
  }

  /**
   * Replay of a trip, for support and for disputed deliveries. A GPS trace is where a person went,
   * so `delivery:read` (every courier holds it) is only the door: the desk may read its tenant's
   * traces, a courier only its own, and a trace of an order only by someone who may read that
   * order. The stall gets none: the trace ends at the customer's door.
   */
  async history(filters: HistoryFilters) {
    this.authorize(PERMISSION.DELIVERY_READ);
    if (filters.orderId === undefined && filters.courierId === undefined) {
      throw new NotFoundError('Tracking history');
    }

    const user = this.currentUser();
    const staff = user.permissions.includes(PERMISSION.ORDER_READ_ANY);
    let courierId = filters.courierId;

    if (filters.orderId !== undefined) {
      // The orders service refuses an order that is not the caller's (and another tenant's).
      const order = await this.orders.get(filters.orderId);
      if (isStallOnlyView(user, order)) {
        throw new ForbiddenError('No trace of this order for the stall');
      }
      // The carrying courier sees its own trace of the order, not a previous courier's.
      const standing = standingOn(user, order);
      if (!standing.staff && !standing.customer) {
        courierId = user.courierId;
        if (courierId === undefined) throw new ForbiddenError('Courier profile required');
      }
    } else if (!staff && (user.courierId === undefined || user.courierId !== courierId)) {
      throw new ForbiddenError('Only your own trace');
    }

    return this.repository.history({
      ...filters,
      ...(courierId !== undefined ? { courierId } : {}),
    });
  }

  /**
   * Everything moving in a city right now, for the operator wall. `courier:read` is held by the
   * desk alone, and the query is tenant-scoped: a city id names a place, not a tenant's couriers.
   */
  async liveMap(cityId: string) {
    this.authorize(PERMISSION.COURIER_READ);
    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);
    return this.repository.liveCouriers(cityId, staleBefore);
  }

  async pruneOlderThan(cutoff: Date): Promise<number> {
    return this.repository.deleteOlderThan(cutoff);
  }

  private requireCourierId(): string {
    const courierId = this.currentUser().courierId;
    if (courierId === undefined) throw new ForbiddenError('Courier profile required');
    return courierId;
  }
}

/** Most pings one call may carry (REST allows 200; the job and socket paths are held to it here). */
const MAX_PINGS_PER_PUSH = 200;
/** A device clock further ahead than this is wrong, not early: the ping counts as received now. */
const MAX_CLOCK_SKEW_MS = 60_000;
/** A backlog older than a shift is not a trace anyone will replay, and would only fill the table. */
const MAX_PING_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_SPEED_KMH = 300;
const MAX_ACCURACY_METERS = 10_000;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const bounded = (value: unknown, max: number): number | undefined =>
  isNumber(value) ? Math.min(Math.max(value, 0), max) : undefined;

/**
 * One ping as the service will believe it, or null when it is not a position at all. Callers
 * (REST, the socket, a job) validate what they can, but this is the choke point: whatever gets
 * here is broadcast to another person's screen and written to the history table, so every field
 * is checked for its type as well as its range.
 */
export function normalizePing(ping: LocationPing, now: Date): LocationPing | null {
  const { lat, lng } = ping;
  if (!isNumber(lat) || !isNumber(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const claimedAt = ping.recordedAt instanceof Date ? ping.recordedAt.getTime() : Number.NaN;
  // No readable clock, or one that is ahead of the server: the ping arrived now.
  const at =
    Number.isNaN(claimedAt) || claimedAt > now.getTime() + MAX_CLOCK_SKEW_MS
      ? now.getTime()
      : claimedAt;
  if (now.getTime() - at > MAX_PING_AGE_MS) return null;

  return {
    lat,
    lng,
    // A compass heading wraps; it does not run off the scale.
    heading: isNumber(ping.heading) ? ((ping.heading % 360) + 360) % 360 : undefined,
    speedKmh: bounded(ping.speedKmh, MAX_SPEED_KMH),
    accuracyMeters: bounded(ping.accuracyMeters, MAX_ACCURACY_METERS),
    recordedAt: new Date(at),
    orderId:
      typeof ping.orderId === 'string' && ping.orderId.length > 0 && ping.orderId.length <= 64
        ? ping.orderId
        : undefined,
  };
}

/** While the courier is on the way to, or at, the counter: the stall may watch them arrive. */
const STALL_WATCHES_COURIER: ReadonlySet<OrderStatus> = new Set([
  ORDER_STATUS.COURIER_ASSIGNED,
  ORDER_STATUS.COURIER_ARRIVED_PICKUP,
  ORDER_STATUS.PICKING_UP,
]);

/**
 * The tracking screen as the stall may see it: the courier and where the goods are collected, but
 * not the customer's door, the road to it, or the clock of the drive there.
 */
export function stallView(view: TrackingView): TrackingView {
  const watching = STALL_WATCHES_COURIER.has(view.status);
  return {
    ...view,
    courierPoint: watching ? view.courierPoint : null,
    courierUpdatedAt: watching ? view.courierUpdatedAt : null,
    dropoffPoint: null,
    etaAt: null,
    etaSeconds: null,
    distanceMeters: null,
    routeGeometry: null,
  };
}

/**
 * Keeps the first ping and then one every `minSeconds`, in device-clock order.
 * The last ping is always kept: it is the current position.
 */
export function thinOut(pings: readonly LocationPing[], minSeconds: number): LocationPing[] {
  const sorted = [...pings].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const kept: LocationPing[] = [];
  let lastKeptAt = 0;

  for (const ping of sorted) {
    const at = ping.recordedAt.getTime();
    if (kept.length === 0 || at - lastKeptAt >= minSeconds * 1000) {
      kept.push(ping);
      lastKeptAt = at;
    }
  }

  const last = sorted[sorted.length - 1];
  if (last !== undefined && kept[kept.length - 1] !== last) kept.push(last);

  return kept;
}

export { RouteEtaCalculator };
