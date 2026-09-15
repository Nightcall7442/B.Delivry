/**
 * Geo module-internal types & DTOs.
 */
import type { GeoLevel } from '@bazar/constants';
import type { GeoJsonPolygon, LatLng } from '@bazar/maps';

export interface PlaceInput {
  level: GeoLevel;
  code: string;
  name: Record<string, string>;
  parentId?: string | null;
  center?: LatLng;
}

export interface ZoneInput {
  name: string;
  cityId: string;
  polygon: [number, number][][];
  tariffId: string;
  priority?: number | undefined;
}

/** A PATCH body: any subset, where absent and undefined both mean "leave it". */
export type ZoneUpdate = {
  [K in keyof ZoneInput]?: ZoneInput[K] | undefined;
} & { active?: boolean | undefined };

/** A zone as the geofence needs it: polygon parsed, tariff attached. */
export interface ZoneWithPolygon {
  id: string;
  name: string;
  cityId: string;
  tariffId: string;
  priority: number;
  polygon: GeoJsonPolygon;
}

export interface ZoneResolution {
  zone: ZoneWithPolygon | null;
  cityId: string | null;
  deliverable: boolean;
  reason: string | null;
}
