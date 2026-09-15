/**
 * yandex MapProvider adapter (Geocoder HTTP API).
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

const GEOCODER = 'https://geocode-maps.yandex.ru/1.x';

interface YandexFeature {
  GeoObject: {
    Point: { pos: string };
    metaDataProperty: {
      GeocoderMetaData: {
        text: string;
        precision?: string;
        Address?: { Components?: { kind: string; name: string }[] };
      };
    };
  };
}

/**
 * Yandex is the strongest geocoder for Uzbek addresses, and the weakest fit
 * for routing here: its routing API is a separate paid product with a
 * different contract. Routing therefore falls back to the estimate, and this
 * provider is chosen when address quality matters more than route precision.
 *
 * ponytail: geocoding only. Wire the Yandex Router API here if routed
 * distances ever turn out to matter more than the Nominatim/OSRM pair.
 */
export class YandexMapProvider implements MapProvider {
  readonly id = 'yandex';

  constructor(
    private readonly config: MapsConfig,
    private readonly logger: Logger,
    private readonly apiKey: string,
  ) {}

  private async geocoder(params: Record<string, string>): Promise<YandexFeature[]> {
    const query = new URLSearchParams({
      apikey: this.apiKey,
      format: 'json',
      results: '10',
      lang: 'ru_RU',
      ...params,
    });

    try {
      const response = await fetchWithTimeout(
        `${GEOCODER}?${query.toString()}`,
        this.config.timeoutMs,
      );
      if (!response.ok) return [];

      const body = (await response.json()) as {
        response?: { GeoObjectCollection?: { featureMember?: YandexFeature[] } };
      };

      return body.response?.GeoObjectCollection?.featureMember ?? [];
    } catch (error) {
      providerErrors.labels('yandex', 'geocode').inc();
      this.logger.warn({ err: error }, 'yandex geocoder request failed');
      return [];
    }
  }

  async geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    const params: Record<string, string> = { geocode: query };
    // Yandex takes lon,lat here, the opposite of most of this codebase.
    if (near !== undefined) params.ll = `${near.lng},${near.lat}`;

    return (await this.geocoder(params)).map(toGeocodeResult);
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const features = await this.geocoder({
      geocode: `${point.lng},${point.lat}`,
      kind: 'house',
      results: '1',
    });

    const first = features[0];
    return first === undefined ? null : toGeocodeResult(first);
  }

  async autocomplete(query: string, near?: LatLng): Promise<AutocompleteSuggestion[]> {
    const results = await this.geocode(query, near);
    return results.map((result, index) => ({
      id: `${result.point.lat},${result.point.lng}:${index}`,
      title: result.formattedAddress,
      ...(result.components.city !== undefined ? { subtitle: result.components.city } : {}),
      point: result.point,
    }));
  }

  // Routing is not part of this adapter; callers get the honest estimate.
  async route(): Promise<Route | null> {
    return null;
  }

  async distance(from: LatLng, to: LatLng): Promise<Distance> {
    return haversineDistance(from, to);
  }

  async eta(from: LatLng, to: LatLng): Promise<Eta> {
    return estimatedEta(from, to);
  }
}

function toGeocodeResult(feature: YandexFeature): GeocodeResult {
  const meta = feature.GeoObject.metaDataProperty.GeocoderMetaData;
  const [lng, lat] = feature.GeoObject.Point.pos.split(' ').map(Number);

  const component = (kind: string): string | undefined =>
    meta.Address?.Components?.find((item) => item.kind === kind)?.name;

  return {
    point: { lat: lat ?? 0, lng: lng ?? 0 },
    formattedAddress: meta.text,
    components: {
      ...(component('country') !== undefined ? { country: component('country') } : {}),
      ...(component('province') !== undefined ? { region: component('province') } : {}),
      ...(component('locality') !== undefined ? { city: component('locality') } : {}),
      ...(component('district') !== undefined ? { district: component('district') } : {}),
      ...(component('street') !== undefined ? { street: component('street') } : {}),
      ...(component('house') !== undefined ? { house: component('house') } : {}),
    },
    // "exact" means a house number was matched; anything else is approximate.
    confidence: meta.precision === 'exact' ? 0.95 : 0.6,
  };
}
