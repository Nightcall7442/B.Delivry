/**
 * osm MapProvider adapter: OSRM for routing, Nominatim for geocoding.
 */
import type {
  AutocompleteSuggestion,
  Distance,
  Eta,
  GeocodeResult,
  LatLng,
  MapProvider,
  Route,
  RouteOptions,
} from '@bazar/maps';
import type { MapsConfig } from '../../../config/index.js';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import { estimatedEta, fetchWithTimeout, haversineDistance } from '../map-provider.interface.js';

/** OSRM profile names differ from our travel modes. */
const PROFILE: Record<string, string> = {
  driving: 'driving',
  cycling: 'cycling',
  walking: 'foot',
};

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: string;
  legs?: { distance: number; duration: number }[];
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  address?: Record<string, string>;
}

/**
 * The default provider: a self-hosted OSRM plus public Nominatim costs nothing
 * per call, which matters when every checkout asks for a distance.
 *
 * Nominatim's public instance rate-limits hard, so anything beyond light use
 * should point at a self-hosted one.
 */
export class OsmMapProvider implements MapProvider {
  readonly id = 'osm';

  constructor(
    private readonly config: MapsConfig,
    private readonly logger: Logger,
  ) {}

  private async osrm(from: LatLng, to: LatLng, options?: RouteOptions): Promise<OsrmRoute | null> {
    const profile = PROFILE[options?.mode ?? 'driving'] ?? 'driving';
    const waypoints = [from, ...(options?.waypoints ?? []), to]
      .map((point) => `${point.lng},${point.lat}`)
      .join(';');

    const url = `${this.config.osrmBaseUrl}/route/v1/${profile}/${waypoints}?overview=full&geometries=polyline`;

    try {
      const response = await fetchWithTimeout(url, this.config.timeoutMs);
      if (!response.ok) return null;

      const body = (await response.json()) as { code: string; routes?: OsrmRoute[] };
      return body.code === 'Ok' ? (body.routes?.[0] ?? null) : null;
    } catch (error) {
      providerErrors.labels('osm', 'route').inc();
      this.logger.warn({ err: error }, 'OSRM request failed');
      return null;
    }
  }

  async route(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Route | null> {
    const result = await this.osrm(from, to, options);
    if (result === null) return null;

    return {
      legs: (result.legs ?? []).map((leg) => ({
        from,
        to,
        distanceMeters: Math.round(leg.distance),
        durationSeconds: Math.round(leg.duration),
      })),
      distanceMeters: Math.round(result.distance),
      durationSeconds: Math.round(result.duration),
      ...(result.geometry !== undefined ? { geometry: result.geometry } : {}),
    };
  }

  async distance(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Distance> {
    const result = await this.osrm(from, to, options);
    // No answer means a rough distance, not an error: the order still needs a price.
    if (result === null) return haversineDistance(from, to);
    return { meters: Math.round(result.distance), source: 'route' };
  }

  async eta(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Eta> {
    const result = await this.osrm(from, to, options);
    if (result === null) return estimatedEta(from, to);

    const seconds = Math.round(result.duration);
    return { seconds, arrivesAt: new Date(Date.now() + seconds * 1000), source: 'route' };
  }

  async geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '10',
      addressdetails: '1',
      // Uzbekistan only: a search for "Chorsu" should not return Turkey.
      countrycodes: 'uz',
    });

    if (near !== undefined) {
      params.set('viewbox', viewboxAround(near));
      params.set('bounded', '0');
    }

    try {
      const response = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        this.config.timeoutMs,
        // Nominatim's usage policy requires an identifying User-Agent.
        { headers: { 'user-agent': 'bazar-delivery/1.0' } },
      );
      if (!response.ok) return [];

      const places = (await response.json()) as NominatimPlace[];
      return places.map(toGeocodeResult);
    } catch (error) {
      providerErrors.labels('osm', 'geocode').inc();
      this.logger.warn({ err: error }, 'Nominatim search failed');
      return [];
    }
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      format: 'jsonv2',
      addressdetails: '1',
    });

    try {
      const response = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
        this.config.timeoutMs,
        { headers: { 'user-agent': 'bazar-delivery/1.0' } },
      );
      if (!response.ok) return null;

      return toGeocodeResult((await response.json()) as NominatimPlace);
    } catch (error) {
      providerErrors.labels('osm', 'reverse_geocode').inc();
      return null;
    }
  }

  async autocomplete(query: string, near?: LatLng): Promise<AutocompleteSuggestion[]> {
    // Nominatim has no dedicated autocomplete, so search doubles as one.
    const results = await this.geocode(query, near);
    return results.map((result, index) => ({
      id: `${result.point.lat},${result.point.lng}:${index}`,
      title: result.formattedAddress,
      ...(result.components.city !== undefined ? { subtitle: result.components.city } : {}),
      point: result.point,
    }));
  }
}

function toGeocodeResult(place: NominatimPlace): GeocodeResult {
  const address = place.address ?? {};

  return {
    point: { lat: Number(place.lat), lng: Number(place.lon) },
    formattedAddress: place.display_name,
    components: {
      ...(address.country !== undefined ? { country: address.country } : {}),
      ...(address.state !== undefined ? { region: address.state } : {}),
      ...((address.city ?? address.town ?? address.village)
        ? { city: address.city ?? address.town ?? address.village }
        : {}),
      ...(address.suburb !== undefined ? { district: address.suburb } : {}),
      ...(address.road !== undefined ? { street: address.road } : {}),
      ...(address.house_number !== undefined ? { house: address.house_number } : {}),
    },
    confidence: place.importance ?? 0.5,
  };
}

/** Roughly 10 km around the point, in the lon,lat,lon,lat order Nominatim wants. */
function viewboxAround(point: LatLng): string {
  const delta = 0.1;
  return [point.lng - delta, point.lat + delta, point.lng + delta, point.lat - delta].join(',');
}
