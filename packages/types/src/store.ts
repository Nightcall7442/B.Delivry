/**
 * store types / DTOs.
 */
import type { StoreStatus, StoreTag, StoreType } from '@bazar/constants';
import type { Entity, Id, LatLngDto, TenantEntity, Translated } from './common.js';

/** Opening hours for one weekday. 0 = Sunday, matching Date.getDay(). */
export interface StoreScheduleDto extends Entity {
  weekday: number;
  /** Minutes since local midnight, so comparisons need no date parsing. */
  opensAt: number;
  closesAt: number;
  closed: boolean;
}

export interface StoreDto extends TenantEntity {
  vendorId: Id;
  type: StoreType;
  status: StoreStatus;
  name: Translated;
  description: Translated | null;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  /** The vendor's morning photo of the counter, and when it was taken. */
  counterPhotoUrl: string | null;
  /** Paid placement runs until then: first on the home list, «Реклама» label. */
  promotedUntil: string | null;
  tags: StoreTag[];
  counterPhotoAt: string | null;
  phone: string | null;
  cityId: Id;
  address: string | null;
  point: LatLngDto | null;
  /** Bazaar row / stall number: what the courier actually looks for. */
  standNumber: string | null;
  /** The person behind the counter — a bazaar is people, not SKUs. */
  ownerName: string | null;
  /** The year they started trading here. */
  ownerSince: number | null;
  ownerPhotoUrl: string | null;
  /** One line in their own words. */
  ownerMotto: Translated | null;
  rating: number;
  reviewCount: number;
  /** Minutes the store needs to gather an order before a courier should arrive. */
  preparationMinutes: number;
  schedule: StoreScheduleDto[];
  /** Computed at read time from schedule + status. */
  isOpen: boolean;
}

/** Compact card for lists and map pins. */
export interface StoreSummaryDto {
  id: Id;
  name: Translated;
  type: StoreType;
  logoUrl: string | null;
  rating: number;
  isOpen: boolean;
  point: LatLngDto | null;
  distanceMeters?: number;
}

export interface CreateStoreDto {
  vendorId: Id;
  type: StoreType;
  name: Translated;
  description?: Translated;
  phone?: string;
  cityId: Id;
  address?: string;
  point?: LatLngDto;
  standNumber?: string;
  preparationMinutes?: number;
}

export type UpdateStoreDto = Partial<Omit<CreateStoreDto, 'vendorId'>> & {
  status?: StoreStatus;
  logoUrl?: string | null;
  coverUrl?: string | null;
  /** Today's photo of the counter; the server stamps the time. */
  counterPhotoUrl?: string | null;
  tags?: StoreTag[];
  ownerName?: string | null;
  ownerSince?: number | null;
  ownerPhotoUrl?: string | null;
  ownerMotto?: Translated | null;
};

export interface StoreListQuery {
  mine?: boolean;
  cityId?: Id;
  type?: StoreType;
  categoryId?: Id;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  openNow?: boolean;
  search?: string;
}
