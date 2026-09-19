/**
 * Stores module-internal types & DTOs.
 */
import type { StoreStatus, StoreType } from '@bazar/constants';

export interface StoreListFilters {
  cityId?: string | undefined;
  type?: StoreType | undefined;
  status?: StoreStatus | undefined;
  vendorId?: string | undefined;
  categoryId?: string | undefined;
  /** Nearby search: all three are required together. */
  lat?: number | undefined;
  lng?: number | undefined;
  radiusMeters?: number | undefined;
  openNow?: boolean | undefined;
  mine?: boolean | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** A store that is confirmed open and locatable, as the order flow needs it. */
export interface OpenStore {
  id: string;
  vendorId: string;
  type: string;
  name: Record<string, string>;
  cityId: string;
  lat: number;
  lng: number;
  preparationMinutes: number;
  /** The store's own limits (minor units) or null for the zone tariff's. */
  minOrder: number | null;
  freeDeliveryThreshold: number | null;
  currency: string;
}

export interface ScheduleEntry {
  weekday: number;
  opensAt: number;
  closesAt: number;
  closed: boolean;
}
