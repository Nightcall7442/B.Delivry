/**
 * tracking types / DTOs.
 */
import type { OrderStatus } from '@bazar/constants';
import type { Id, LatLngDto } from './common.js';
import type { CourierPublicDto } from './courier.js';

/** One GPS fix from a courier device. High volume: kept lean on purpose. */
export interface CourierLocationDto {
  courierId: Id;
  lat: number;
  lng: number;
  /** Degrees clockwise from north; drives the arrow on the map. */
  heading: number | null;
  speedKmh: number | null;
  accuracyMeters: number | null;
  /** Device clock, not server clock: pings arrive out of order. */
  recordedAt: string;
}

export interface PushLocationDto {
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
  accuracyMeters?: number;
  recordedAt?: string;
  /** Present while on a delivery: lets the server fan out to the order room. */
  orderId?: Id;
}

/** The live screen a customer watches while waiting. */
export interface OrderTrackingDto {
  orderId: Id;
  status: OrderStatus;
  courier: CourierPublicDto | null;
  courierPoint: LatLngDto | null;
  courierUpdatedAt: string | null;
  pickupPoint: LatLngDto | null;
  dropoffPoint: LatLngDto | null;
  etaAt: string | null;
  etaSeconds: number | null;
  distanceMeters: number | null;
  /** Encoded polyline of the remaining route, when a routing provider answered. */
  routeGeometry: string | null;
}

export interface TrackingHistoryQuery {
  orderId?: Id;
  courierId?: Id;
  from?: string;
  to?: string;
}
