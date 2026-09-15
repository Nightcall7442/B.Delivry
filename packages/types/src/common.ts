/**
 * common types / DTOs.
 */
import type { Currency, Locale } from '@bazar/constants';

export type Id = string;
export type IsoDateTime = string;

/** Every persisted record carries these. Soft-deleted rows keep `deletedAt`. */
export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt?: IsoDateTime | null;
}

export interface Entity extends Timestamps {
  id: Id;
}

/** Tenant-scoped entity: every query is filtered by this. */
export interface TenantEntity extends Entity {
  tenantId: Id;
}

/** Money crossing the wire: integer minor units plus its currency. */
export interface MoneyDto {
  amount: number;
  currency: Currency;
}

export interface LatLngDto {
  lat: number;
  lng: number;
}

/** Text that exists in every supported locale (product names, category titles). */
export type Translated = Partial<Record<Locale, string>> & { [key: string]: string | undefined };

export interface ImageDto {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export type SortDirection = 'asc' | 'desc';

export interface SortInput {
  field: string;
  direction: SortDirection;
}

export interface DateRange {
  from: IsoDateTime;
  to: IsoDateTime;
}
