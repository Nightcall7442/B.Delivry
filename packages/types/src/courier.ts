/**
 * courier types / DTOs.
 */
import type { CourierStatus, VehicleType } from '@bazar/constants';
import type { Id, LatLngDto, MoneyDto, TenantEntity } from './common.js';

export interface CourierDto extends TenantEntity {
  userId: Id;
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string | null;
  status: CourierStatus;
  vehicleType: VehicleType;
  plateNumber: string | null;
  cityId: Id;
  rating: number;
  ratingCount: number;
  completedOrders: number;
  cancelledOrders: number;
  /** Cash collected on delivery that the courier still owes the platform. */
  balance: MoneyDto;
  /** How many orders they may carry at once. */
  maxConcurrentOrders: number;
  activeOrderCount: number;
  lastLocation: LatLngDto | null;
  lastLocationAt: string | null;
  verifiedAt: string | null;
  neighbour: boolean;
}

/** What a customer is allowed to see about their courier. */
export interface CourierPublicDto {
  id: Id;
  firstName: string;
  avatarUrl: string | null;
  rating: number;
  vehicleType: VehicleType;
  plateNumber: string | null;
  /** Masked: +998 90 *** ** 67. Calls go through a proxy number in production. */
  phone: string;
  /** A mahalla courier: a neighbour on foot, not a fleet rider. */
  neighbour: boolean;
}

export interface CourierShiftDto {
  status: CourierStatus;
  since: string;
  /** Minutes worked in the current local day. */
  todayMinutes: number;
  todayOrders: number;
  todayEarnings: MoneyDto;
}

export interface UpdateCourierStatusDto {
  status: CourierStatus;
  lat?: number;
  lng?: number;
}

export interface CourierListQuery {
  cityId?: Id;
  status?: CourierStatus;
  vehicleType?: VehicleType;
  search?: string;
  /** Only couriers seen within DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS. */
  onlineOnly?: boolean;
}

/** A candidate produced by the matching strategy, before an offer is sent. */
export interface CourierCandidateDto {
  courierId: Id;
  distanceMeters: number;
  etaSeconds: number;
  rating: number;
  activeOrderCount: number;
  score: number;
}
