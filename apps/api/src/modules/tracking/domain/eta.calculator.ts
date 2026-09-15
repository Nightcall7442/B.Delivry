/**
 * ETA calculation contract using MapProvider routes.
 */
import { VEHICLE_AVG_SPEED_KMH, type VehicleType } from '@bazar/constants';
import { haversineMeters, type LatLng, type MapProvider } from '@bazar/maps';

export interface EtaResult {
  seconds: number;
  arrivesAt: Date;
  distanceMeters: number;
  source: 'route' | 'estimate';
  geometry: string | null;
}

export interface EtaCalculator {
  estimate(
    from: LatLng,
    to: LatLng,
    vehicle: VehicleType,
    extraSeconds?: number,
  ): Promise<EtaResult>;
}

/**
 * Asks the routing provider, and falls back to distance over an average city
 * speed when it cannot answer.
 *
 * The fallback matters more than it looks: ETA is recomputed for every active
 * delivery on a schedule, so a slow or rate-limited vendor would otherwise
 * stall the whole tracking screen. A rough ETA beats a spinner.
 */
export class RouteEtaCalculator implements EtaCalculator {
  constructor(private readonly maps: MapProvider) {}

  async estimate(
    from: LatLng,
    to: LatLng,
    vehicle: VehicleType,
    extraSeconds = 0,
  ): Promise<EtaResult> {
    const mode = vehicle === 'FOOT' ? 'walking' : vehicle === 'BICYCLE' ? 'cycling' : 'driving';

    try {
      const route = await this.maps.route(from, to, { mode });
      if (route !== null) {
        const seconds = route.durationSeconds + extraSeconds;
        return {
          seconds,
          arrivesAt: new Date(Date.now() + seconds * 1000),
          distanceMeters: route.distanceMeters,
          source: 'route',
          geometry: route.geometry ?? null,
        };
      }
    } catch {
      // Fall through to the estimate; the caller does not need to know the
      // vendor failed, only that this ETA is approximate.
    }

    return estimateFromDistance(from, to, vehicle, extraSeconds);
  }
}

/** Straight-line distance with a detour factor, over the vehicle's city speed. */
export function estimateFromDistance(
  from: LatLng,
  to: LatLng,
  vehicle: VehicleType,
  extraSeconds = 0,
): EtaResult {
  const straight = haversineMeters(from, to);
  // Real streets are longer than the crow flies; 1.3 is the usual city factor.
  const distanceMeters = Math.round(straight * 1.3);
  const speedKmh = VEHICLE_AVG_SPEED_KMH[vehicle];
  const seconds = Math.round((distanceMeters / 1000 / speedKmh) * 3600) + extraSeconds;

  return {
    seconds,
    arrivesAt: new Date(Date.now() + seconds * 1000),
    distanceMeters,
    source: 'estimate',
    geometry: null,
  };
}
