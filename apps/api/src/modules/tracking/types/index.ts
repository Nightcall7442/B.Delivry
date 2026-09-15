/**
 * Tracking module-internal types & DTOs.
 */
import type { OrderStatus } from '@bazar/constants';
import type { CourierPublicDto } from '@bazar/types';
import type { LatLng } from '@bazar/maps';

export interface LocationPing {
  lat: number;
  lng: number;
  heading?: number | undefined;
  speedKmh?: number | undefined;
  accuracyMeters?: number | undefined;
  /** Device clock. Pings arrive late and out of order. */
  recordedAt: Date;
  orderId?: string | undefined;
}

export interface TrackingView {
  orderId: string;
  status: OrderStatus;
  courier: CourierPublicDto | null;
  courierPoint: LatLng | null;
  courierUpdatedAt: Date | null;
  pickupPoint: LatLng | null;
  dropoffPoint: LatLng | null;
  etaAt: Date | null;
  etaSeconds: number | null;
  distanceMeters: number | null;
  routeGeometry: string | null;
}

export interface HistoryFilters {
  orderId?: string | undefined;
  courierId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit?: number | undefined;
}
