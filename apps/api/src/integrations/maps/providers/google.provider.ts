/**
 * google MapProvider adapter (Directions + Geocoding + Places).
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

const BASE = 'https://maps.googleapis.com/maps/api';

const MODE: Record<string, string> = {
  driving: 'driving',
  cycling: 'bicycling',
  walking: 'walking',
};

interface DirectionsLeg {
  distance: { value: number };
  duration: { value: number };
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
}

interface DirectionsRoute {
  legs: DirectionsLeg[];
  overview_polyline?: { points: string };
}

/**
 * Billed per request, so every call here is one a cheaper provider could not
 * answer well enough. Failures degrade to the haversine estimate rather than
 * propagating: a Google outage must not stop orders.
 */
export class GoogleMapProvider implements MapProvider {
  readonly id = 'google';

  constructor(
    private readonly config: MapsConfig,
    private readonly logger: Logger,
    private readonly apiKey: string,
  ) {}

  private async get<T>(
    path: string,
    params: Record<string, string>,
    operation: string,
  ): Promise<T | null> {
    const query = new URLSearchParams({ ...params, key: this.apiKey });

    try {
      const response = await fetchWithTimeout(
        `${BASE}${path}?${query.toString()}`,
        this.config.timeoutMs,
      );
      if (!response.ok) return null;

      const body = (await response.json()) as { status: string } & T;
      // Google reports failures in the body with HTTP 200, so the status field
      // is the only real signal.
      if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
        providerErrors.labels('google', operation).inc();
        this.logger.warn({ status: body.status, operation }, 'google maps error');
        return null;
      }

      return body;
    } catch (error) {
      providerErrors.labels('google', operation).inc();
      this.logger.warn({ err: error, operation }, 'google maps request failed');
      return null;
    }
  }

  private async directions(
    from: LatLng,
    to: LatLng,
    options?: RouteOptions,
  ): Promise<DirectionsRoute | null> {
    const params: Record<string, string> = {
      origin: `${from.lat},${from.lng}`,
      destination: `${to.lat},${to.lng}`,
      mode: MODE[options?.mode ?? 'driving'] ?? 'driving',
      region: 'uz',
    };

    if (options?.waypoints !== undefined && options.waypoints.length > 0) {
      params.waypoints = options.waypoints.map((point) => `${point.lat},${point.lng}`).join('|');
    }
    if (options?.departAt !== undefined) {
      params.departure_time = String(Math.floor(options.departAt.getTime() / 1000));
    }

    const body = await this.get<{ routes?: DirectionsRoute[] }>(
      '/directions/json',
      params,
      'route',
    );
    return body?.routes?.[0] ?? null;
  }

  async route(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Route | null> {
    const route = await this.directions(from, to, options);
    if (route === null) return null;

    const distanceMeters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const durationSeconds = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

    return {
      legs: route.legs.map((leg) => ({
        from: { lat: leg.start_location.lat, lng: leg.start_location.lng },
        to: { lat: leg.end_location.lat, lng: leg.end_location.lng },
        distanceMeters: leg.distance.value,
        durationSeconds: leg.duration.value,
      })),
      distanceMeters,
      durationSeconds,
      ...(route.overview_polyline !== undefined
        ? { geometry: route.overview_polyline.points }
        : {}),
    };
  }

  async distance(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Distance> {
    const route = await this.route(from, to, options);
    return route === null
      ? haversineDistance(from, to)
      : { meters: route.distanceMeters, source: 'route' };
  }

  async eta(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Eta> {
    const route = await this.route(from, to, options);
    if (route === null) return estimatedEta(from, to);

    return {
      seconds: route.durationSeconds,
      arrivesAt: new Date(Date.now() + route.durationSeconds * 1000),
      source: 'route',
    };
  }

  async geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    const params: Record<string, string> = {
      address: query,
      region: 'uz',
      components: 'country:UZ',
    };
    if (near !== undefined) params.bounds = boundsAround(near);

    const body = await this.get<{ results?: GoogleGeocodeResult[] }>(
      '/geocode/json',
      params,
      'geocode',
    );
    return (body?.results ?? []).map(toGeocodeResult);
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const body = await this.get<{ results?: GoogleGeocodeResult[] }>(
      '/geocode/json',
      { latlng: `${point.lat},${point.lng}` },
      'reverse_geocode',
    );

    const first = body?.results?.[0];
    return first === undefined ? null : toGeocodeResult(first);
  }

  async autocomplete(query: string, near?: LatLng): Promise<AutocompleteSuggestion[]> {
    const params: Record<string, string> = { input: query, components: 'country:uz' };
    if (near !== undefined) {
      params.location = `${near.lat},${near.lng}`;
      params.radius = '20000';
    }

    const body = await this.get<{ predictions?: GooglePrediction[] }>(
      '/place/autocomplete/json',
      params,
      'autocomplete',
    );

    return (body?.predictions ?? []).map((prediction) => ({
      id: prediction.place_id,
      title: prediction.structured_formatting?.main_text ?? prediction.description,
      ...(prediction.structured_formatting?.secondary_text !== undefined
        ? { subtitle: prediction.structured_formatting.secondary_text }
        : {}),
    }));
  }
}

interface GoogleGeocodeResult {
  geometry: { location: { lat: number; lng: number } };
  formatted_address: string;
  address_components?: { long_name: string; types: string[] }[];
}

interface GooglePrediction {
  place_id: string;
  description: string;
  structured_formatting?: { main_text: string; secondary_text?: string };
}

function toGeocodeResult(result: GoogleGeocodeResult): GeocodeResult {
  const component = (type: string): string | undefined =>
    result.address_components?.find((item) => item.types.includes(type))?.long_name;

  return {
    point: { lat: result.geometry.location.lat, lng: result.geometry.location.lng },
    formattedAddress: result.formatted_address,
    components: {
      ...(component('country') !== undefined ? { country: component('country') } : {}),
      ...(component('administrative_area_level_1') !== undefined
        ? { region: component('administrative_area_level_1') }
        : {}),
      ...(component('locality') !== undefined ? { city: component('locality') } : {}),
      ...(component('sublocality') !== undefined ? { district: component('sublocality') } : {}),
      ...(component('route') !== undefined ? { street: component('route') } : {}),
      ...(component('street_number') !== undefined ? { house: component('street_number') } : {}),
    },
    confidence: 0.8,
  };
}

/** Roughly 20 km around the point, as the sw|ne pair Google expects. */
function boundsAround(point: LatLng): string {
  const delta = 0.2;
  return `${point.lat - delta},${point.lng - delta}|${point.lat + delta},${point.lng + delta}`;
}
