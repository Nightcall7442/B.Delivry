/**
 * Tracking business logic. Live courier location ingestion, ETA, order tracking feed.
 */
import { DELIVERY_TIMEOUTS, PERMISSION, type VehicleType } from '@bazar/constants';
import { WS_EVENT } from '@bazar/types';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/domain.errors.js';
import type { RealtimePublisher } from '../../../infrastructure/redis/realtime-events.js';
import { room } from '../../../websocket/rooms.js';
import type { DeliveryService } from '../../delivery/service/delivery.service.js';
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
   */
  async push(pings: LocationPing[]): Promise<void> {
    const courierId = this.requireCourierId();
    if (pings.length === 0) return;

    const filtered = thinOut(pings, DELIVERY_TIMEOUTS.LOCATION_MIN_INTERVAL_SECONDS);
    const latest = filtered[filtered.length - 1];
    if (latest === undefined) return;

    const orderId = latest.orderId ?? null;
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

    await this.repository.savePings(courierId, filtered);
  }

  /** The live screen a customer watches while waiting. */
  async trackOrder(orderId: string): Promise<TrackingView> {
    const order = await this.orders.get(orderId);
    const delivery = await this.delivery.findByOrder(orderId);

    const [courierLocation, courier] =
      order.courierId === null
        ? [null, null]
        : await Promise.all([
            this.repository.lastLocation(order.courierId),
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

  /** Replay of a trip, for support and for disputed deliveries. */
  async history(filters: HistoryFilters) {
    this.authorize(PERMISSION.DELIVERY_READ);
    if (filters.orderId === undefined && filters.courierId === undefined) {
      throw new NotFoundError('Tracking history');
    }
    return this.repository.history(filters);
  }

  /** Everything moving in a city right now, for the operator wall. */
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
