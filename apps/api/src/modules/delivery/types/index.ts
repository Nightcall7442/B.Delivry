/**
 * Delivery module-internal types & DTOs.
 */
import type { DeliveryStatus, VehicleType } from '@bazar/constants';
import type { LatLng } from '@bazar/maps';

/** A courier the search may offer an order to, with everything scoring needs. */
export interface CourierCandidate {
  courierId: string;
  point: LatLng;
  vehicleType: VehicleType;
  rating: number;
  activeOrderCount: number;
  maxConcurrentOrders: number;
  distanceMeters: number;
  lastSeenAt: Date;
  /** Mahalla courier: only orders whose dropoff is within the radius of home. */
  home: { point: LatLng; radiusMeters: number } | null;
}

export interface ScoredCandidate extends CourierCandidate {
  score: number;
  etaSeconds: number;
}

export interface SearchContext {
  orderId: string;
  pickup: LatLng;
  dropoff: LatLng;
  radiusMeters: number;
  weightGrams: number;
  /** Couriers already offered this order, who must not be offered it again. */
  excludeCourierIds: string[];
}

export interface CreateDeliveryInput {
  orderId: string;
  pickup: LatLng | null;
  pickupAddress: string;
  dropoff: LatLng | null;
  dropoffAddress: string;
  distanceMeters: number;
  payout: number;
  currency: string;
}

export interface DeliveryListFilters {
  courierId?: string | undefined;
  status?: DeliveryStatus | undefined;
  cityId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CompleteInput {
  proofUrl?: string | undefined;
  handoverCode?: string | undefined;
  point?: LatLng | undefined;
}
