/**
 * Geometry decides whether an address is deliverable at all, so the zone
 * check gets the cases that actually bite: edges, holes, and the bounding box
 * that has to contain what the exact check accepts.
 */
import { describe, expect, it } from 'vitest';
import { boundingBox, haversineMeters, isWithin, pointInPolygon } from './geo.utils.js';
import type { GeoJsonPolygon } from './types.js';

const TASHKENT = { lat: 41.2995, lng: 69.2401 };
const SAMARKAND = { lat: 39.627, lng: 66.975 };

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(TASHKENT, TASHKENT)).toBe(0);
  });

  it('matches the known Tashkent to Samarkand distance', () => {
    const km = haversineMeters(TASHKENT, SAMARKAND) / 1000;
    // Great-circle distance is about 267 km; allow for a loose tolerance.
    expect(km).toBeGreaterThan(255);
    expect(km).toBeLessThan(280);
  });

  it('is symmetric', () => {
    expect(haversineMeters(TASHKENT, SAMARKAND)).toBeCloseTo(
      haversineMeters(SAMARKAND, TASHKENT),
      6,
    );
  });
});

describe('pointInPolygon', () => {
  // A square around Tashkent centre. GeoJSON order is [lng, lat].
  const square: GeoJsonPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [69.2, 41.25],
        [69.3, 41.25],
        [69.3, 41.35],
        [69.2, 41.35],
        [69.2, 41.25],
      ],
    ],
  };

  it('accepts a point inside and rejects one outside', () => {
    expect(pointInPolygon({ lat: 41.3, lng: 69.25 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 41.4, lng: 69.25 }, square)).toBe(false);
    expect(pointInPolygon(SAMARKAND, square)).toBe(false);
  });

  it('treats a hole as outside the zone', () => {
    const withHole: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        square.coordinates[0]!,
        [
          [69.24, 41.29],
          [69.26, 41.29],
          [69.26, 41.31],
          [69.24, 41.31],
          [69.24, 41.29],
        ],
      ],
    };

    // Inside the outer ring but inside the hole: not deliverable.
    expect(pointInPolygon({ lat: 41.3, lng: 69.25 }, withHole)).toBe(false);
    // Inside the outer ring and outside the hole: deliverable.
    expect(pointInPolygon({ lat: 41.27, lng: 69.22 }, withHole)).toBe(true);
  });

  it('does not crash on a degenerate ring', () => {
    const broken: GeoJsonPolygon = { type: 'Polygon', coordinates: [[]] };
    expect(pointInPolygon(TASHKENT, broken)).toBe(false);
  });
});

describe('boundingBox', () => {
  it('contains every point the exact check would accept', () => {
    // The box is the SQL prefilter; anything it excludes never reaches the
    // exact distance check, so it must not be tighter than the radius.
    const radius = 5_000;
    const box = boundingBox(TASHKENT, radius);

    const north = { lat: box.north, lng: TASHKENT.lng };
    const east = { lat: TASHKENT.lat, lng: box.east };

    expect(haversineMeters(TASHKENT, north)).toBeGreaterThanOrEqual(radius - 1);
    expect(haversineMeters(TASHKENT, east)).toBeGreaterThanOrEqual(radius - 1);
  });

  it('agrees with isWithin at the centre', () => {
    expect(isWithin(TASHKENT, { lat: 41.3, lng: 69.245 }, 5_000)).toBe(true);
    expect(isWithin(TASHKENT, SAMARKAND, 5_000)).toBe(false);
  });
});
