/**
 * Server-side MapProvider contract (re-exports @bazar/maps types): geocode, reverseGeocode, route, distanceMatrix, eta.
 */
export type {
  MapProvider,
  RouteOptions,
  AutocompleteSuggestion,
  Distance,
  Eta,
  GeocodeResult,
  LatLng,
  Route,
  TravelMode,
} from '@bazar/maps';

export { MAP_PROVIDER } from '@bazar/maps';
export type { MapProviderId } from '@bazar/maps';

import { VEHICLE_AVG_SPEED_KMH } from '@bazar/constants';
import { haversineMeters, type Distance, type Eta, type LatLng } from '@bazar/maps';

/**
 * Every adapter falls back to these when the vendor is unreachable. Pricing
 * and ETA sit on the checkout path, so "the map API is down" must degrade to a
 * rough answer rather than refusing the order.
 */
export function haversineDistance(from: LatLng, to: LatLng): Distance {
  // Streets are longer than the crow flies; 1.3 is the usual city factor.
  return { meters: Math.round(haversineMeters(from, to) * 1.3), source: 'haversine' };
}

export function estimatedEta(
  from: LatLng,
  to: LatLng,
  speedKmh = VEHICLE_AVG_SPEED_KMH.SCOOTER,
): Eta {
  const meters = haversineDistance(from, to).meters;
  const seconds = Math.round((meters / 1000 / speedKmh) * 3600);
  return { seconds, arrivesAt: new Date(Date.now() + seconds * 1000), source: 'estimate' };
}

/** Vendor calls are on the checkout path; a hung request is worse than none. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
