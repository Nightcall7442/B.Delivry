/**
 * dgis (2GIS) MapProvider adapter: Catalog for search, Routing for distance.
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

const CATALOG = 'https://catalog.api.2gis.com/3.0/items';
const ROUTING = 'https://routing.api.2gis.com/routing/7.0.0/global';

interface DgisItem {
  id: string;
  name: string;
  full_name?: string;
  address_name?: string;
  point?: { lat: number; lon: number };
  adm_div?: { type: string; name: string }[];
}

/**
 * 2GIS knows Uzbek bazaars and business names better than the global
 * providers, which is exactly what a customer types when they mean a stall.
 */
export class DgisMapProvider implements MapProvider {
  readonly id = '2gis';

  constructor(
    private readonly config: MapsConfig,
    private readonly logger: Logger,
    private readonly apiKey: string,
  ) {}

  private async search(query: string, near?: LatLng): Promise<DgisItem[]> {
    const params = new URLSearchParams({
      q: query,
      key: this.apiKey,
      fields: 'items.point,items.adm_div,items.address',
      page_size: '10',
    });

    if (near !== undefined) params.set('location', `${near.lng},${near.lat}`);

    try {
      const response = await fetchWithTimeout(
        `${CATALOG}?${params.toString()}`,
        this.config.timeoutMs,
      );
      if (!response.ok) return [];

      const body = (await response.json()) as { result?: { items?: DgisItem[] } };
      return body.result?.items ?? [];
    } catch (error) {
      providerErrors.labels('2gis', 'geocode').inc();
      this.logger.warn({ err: error }, '2gis catalog request failed');
      return [];
    }
  }

  async geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    return (await this.search(query, near)).flatMap(toGeocodeResult);
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lng),
      key: this.apiKey,
      fields: 'items.point,items.adm_div,items.address',
      radius: '200',
    });

    try {
      const response = await fetchWithTimeout(
        `${CATALOG}?${params.toString()}`,
        this.config.timeoutMs,
      );
      if (!response.ok) return null;

      const body = (await response.json()) as { result?: { items?: DgisItem[] } };
      const first = body.result?.items?.[0];
      return first === undefined ? null : (toGeocodeResult(first)[0] ?? null);
    } catch (error) {
      providerErrors.labels('2gis', 'reverse_geocode').inc();
      return null;
    }
  }

  async autocomplete(query: string, near?: LatLng): Promise<AutocompleteSuggestion[]> {
    return (await this.search(query, near)).map((item) => ({
      id: item.id,
      title: item.name,
      ...(item.address_name !== undefined ? { subtitle: item.address_name } : {}),
      ...(item.point !== undefined ? { point: { lat: item.point.lat, lng: item.point.lon } } : {}),
    }));
  }

  async route(from: LatLng, to: LatLng, options?: RouteOptions): Promise<Route | null> {
    try {
      const response = await fetchWithTimeout(
        `${ROUTING}?key=${this.apiKey}`,
        this.config.timeoutMs,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            points: [
              { type: 'stop', lon: from.lng, lat: from.lat },
              { type: 'stop', lon: to.lng, lat: to.lat },
            ],
            transport: options?.mode === 'walking' ? 'walking' : 'driving',
            route_mode: 'fastest',
          }),
        },
      );

      if (!response.ok) return null;

      const body = (await response.json()) as {
        result?: { total_distance: number; total_duration: number }[];
      };
      const result = body.result?.[0];
      if (result === undefined) return null;

      return {
        legs: [
          {
            from,
            to,
            distanceMeters: Math.round(result.total_distance),
            durationSeconds: Math.round(result.total_duration),
          },
        ],
        distanceMeters: Math.round(result.total_distance),
        durationSeconds: Math.round(result.total_duration),
      };
    } catch (error) {
      providerErrors.labels('2gis', 'route').inc();
      this.logger.warn({ err: error }, '2gis routing request failed');
      return null;
    }
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
}

/** Items without coordinates cannot be delivered to, so they are dropped. */
function toGeocodeResult(item: DgisItem): GeocodeResult[] {
  if (item.point === undefined) return [];

  const division = (type: string): string | undefined =>
    item.adm_div?.find((entry) => entry.type === type)?.name;

  return [
    {
      point: { lat: item.point.lat, lng: item.point.lon },
      formattedAddress: item.full_name ?? item.address_name ?? item.name,
      components: {
        ...(division('country') !== undefined ? { country: division('country') } : {}),
        ...(division('region') !== undefined ? { region: division('region') } : {}),
        ...(division('city') !== undefined ? { city: division('city') } : {}),
        ...(division('district') !== undefined ? { district: division('district') } : {}),
      },
      confidence: 0.85,
    },
  ];
}
