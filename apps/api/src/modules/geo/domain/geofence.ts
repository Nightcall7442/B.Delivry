/**
 * Point-in-zone / geofencing contract.
 */
import { pointInPolygon, type LatLng } from '@bazar/maps';
import type { ZoneWithPolygon } from '../types/index.js';

export interface Geofence {
  /** The zone covering this point, or null when nothing covers it. */
  locate(point: LatLng, zones: readonly ZoneWithPolygon[]): ZoneWithPolygon | null;
}

/**
 * Zones are hand-drawn and overlap on purpose: a district may sit inside a
 * city-wide fallback zone with a cheaper tariff. Highest priority wins, so the
 * specific zone beats the fallback regardless of insertion order.
 *
 * ponytail: linear scan over the city's zones, checked in application code.
 * A city has tens of zones, not thousands, so this is far cheaper than the
 * PostGIS dependency it would take to push the check into SQL. Revisit if
 * zone counts ever reach the hundreds per city.
 */
export class PolygonGeofence implements Geofence {
  locate(point: LatLng, zones: readonly ZoneWithPolygon[]): ZoneWithPolygon | null {
    let best: ZoneWithPolygon | null = null;

    for (const zone of zones) {
      if (!pointInPolygon(point, zone.polygon)) continue;
      if (best === null || zone.priority > best.priority) best = zone;
    }

    return best;
  }
}

/** Parses the stored GeoJSON coordinates, rejecting anything malformed. */
export function toPolygon(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) return null;

  const rings: [number, number][][] = [];
  for (const ring of value) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const points: [number, number][] = [];
    for (const position of ring) {
      if (!Array.isArray(position) || position.length < 2) return null;
      const [lng, lat] = position;
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      points.push([lng, lat]);
    }
    rings.push(points);
  }

  return rings.length > 0 ? rings : null;
}
