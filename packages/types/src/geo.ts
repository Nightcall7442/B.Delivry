/**
 * geo types / DTOs.
 */
import type { GeoLevel } from '@bazar/constants';
import type { Entity, Id, LatLngDto, MoneyDto, Translated } from './common.js';

/** Region -> City -> District -> Mahalla, one table, self-referencing. */
export interface GeoPlaceDto extends Entity {
  level: GeoLevel;
  code: string;
  name: Translated;
  parentId: Id | null;
  center: LatLngDto | null;
  active: boolean;
}

export interface DeliveryZoneDto extends Entity {
  name: string;
  cityId: Id;
  /** GeoJSON polygon ring: [lng, lat] pairs, first point repeated last. */
  polygon: [number, number][][];
  tariffId: Id;
  active: boolean;
  /** Higher wins where zones overlap. */
  priority: number;
}

export interface ResolveZoneQuery {
  lat: number;
  lng: number;
}

export interface ResolveZoneResultDto {
  zone: DeliveryZoneDto | null;
  cityId: Id | null;
  /** False when the point is outside every active zone: no delivery there. */
  deliverable: boolean;
  minOrder: MoneyDto | null;
}

export interface GeocodeQuery {
  query: string;
  lat?: number;
  lng?: number;
}

export interface GeocodeResultDto {
  formattedAddress: string;
  point: LatLngDto;
  cityId: Id | null;
  confidence: number;
}
