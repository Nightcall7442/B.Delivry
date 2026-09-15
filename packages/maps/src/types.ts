/**
 * LatLng, BoundingBox, Route, Leg, Distance, Eta, GeocodeResult, Polygon (GeoJSON-compatible).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** GeoJSON order is [lng, lat] — keep that straight when talking to map APIs. */
export type GeoJsonPosition = [number, number];

export interface GeoJsonPolygon {
  type: 'Polygon';
  /** First ring is the outer boundary, the rest are holes. */
  coordinates: GeoJsonPosition[][];
}

export interface Distance {
  meters: number;
  /** Straight-line when no routing provider is available. */
  source: 'route' | 'haversine';
}

export interface Eta {
  seconds: number;
  /** Absolute arrival time, computed from `seconds` at request time. */
  arrivesAt: Date;
  source: 'route' | 'estimate';
}

export interface Leg {
  from: LatLng;
  to: LatLng;
  distanceMeters: number;
  durationSeconds: number;
}

export interface Route {
  legs: Leg[];
  distanceMeters: number;
  durationSeconds: number;
  /** Encoded polyline for drawing the route on a client map. */
  geometry?: string;
}

export interface GeocodeResult {
  point: LatLng;
  formattedAddress: string;
  /** Whatever the vendor could resolve; every part is optional and often absent. */
  components: {
    country?: string | undefined;
    region?: string | undefined;
    city?: string | undefined;
    district?: string | undefined;
    street?: string | undefined;
    house?: string | undefined;
  };
  confidence: number;
}

export interface AutocompleteSuggestion {
  id: string;
  title: string;
  subtitle?: string;
  point?: LatLng;
}

export type TravelMode = 'driving' | 'cycling' | 'walking';
