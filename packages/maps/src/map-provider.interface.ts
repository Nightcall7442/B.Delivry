/**
 * MapProvider interface: geocode, reverseGeocode, route, distance, eta, autocomplete. Provider-neutral.
 */
import type {
  AutocompleteSuggestion,
  Distance,
  Eta,
  GeocodeResult,
  LatLng,
  Route,
  TravelMode,
} from './types.js';

export interface RouteOptions {
  mode?: TravelMode;
  /** Intermediate stops, in order (pickup points on a multi-store order). */
  waypoints?: LatLng[];
  departAt?: Date;
}

/**
 * Every mapping vendor sits behind this. Nothing above it knows whether the
 * answer came from Google, Yandex, 2GIS or a local OSRM.
 *
 * Implementations must degrade instead of throwing when the vendor is down:
 * `distance` falls back to haversine and `eta` to an average-speed estimate,
 * since an order must still be priced when the vendor is unreachable.
 */
export interface MapProvider {
  readonly id: string;

  geocode(query: string, near?: LatLng): Promise<GeocodeResult[]>;

  reverseGeocode(point: LatLng): Promise<GeocodeResult | null>;

  route(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Route | null>;

  distance(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Distance>;

  eta(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Eta>;

  autocomplete(query: string, near?: LatLng): Promise<AutocompleteSuggestion[]>;
}
