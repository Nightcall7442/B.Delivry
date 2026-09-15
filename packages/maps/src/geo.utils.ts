/**
 * Pure geo helpers: haversine, pointInPolygon, bearing.
 */
import type { BoundingBox, GeoJsonPolygon, LatLng } from './types.js';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Great-circle distance in meters. Good to ~0.5% over city distances, which is
 * well inside the error of any delivery ETA, so it is the default before routing.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing a to b, in degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Ray casting against a GeoJSON polygon, holes included: a point inside a hole
 * is outside the zone. Delivery zones are drawn by hand and do have holes.
 */
export function pointInPolygon(point: LatLng, polygon: GeoJsonPolygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (outer === undefined || !inRing(point, outer)) return false;
  return !holes.some((hole) => inRing(point, hole));
}

function inRing(point: LatLng, ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!;
    const b = ring[j]!;
    const [aLng, aLat] = a;
    const [bLng, bLat] = b;
    const straddles = aLat > point.lat !== bLat > point.lat;
    if (!straddles) continue;
    const lngAtLat = ((bLng - aLng) * (point.lat - aLat)) / (bLat - aLat) + aLng;
    if (point.lng < lngAtLat) inside = !inside;
  }
  return inside;
}

/**
 * Square box around a point, for a cheap SQL prefilter before the exact
 * distance check: `WHERE lat BETWEEN ... AND lng BETWEEN ...` uses an index,
 * haversine does not.
 */
export function boundingBox(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = toDeg(radiusMeters / EARTH_RADIUS_M);
  const lngDelta = toDeg(radiusMeters / (EARTH_RADIUS_M * Math.cos(toRad(center.lat))));
  return {
    south: center.lat - latDelta,
    north: center.lat + latDelta,
    west: center.lng - lngDelta,
    east: center.lng + lngDelta,
  };
}

export const isWithin = (a: LatLng, b: LatLng, radiusMeters: number): boolean =>
  haversineMeters(a, b) <= radiusMeters;

export const isValidLatLng = (point: LatLng): boolean =>
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 90 &&
  Math.abs(point.lng) <= 180;
