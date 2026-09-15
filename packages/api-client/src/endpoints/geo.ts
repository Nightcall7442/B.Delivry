/** Endpoint functions for /geo. */
import type {
  GeocodeQuery,
  GeocodeResultDto,
  GeoPlaceDto,
  ResolveZoneQuery,
  ResolveZoneResultDto,
} from '@bazar/types';

import type { Http } from '../client.js';

export const geoApi = (http: Http) => ({
  cities: () => http.request<GeoPlaceDto[]>('GET', '/geo/cities'),
  places: (query: { parentId?: string; level?: string } = {}) =>
    http.request<GeoPlaceDto[]>('GET', '/geo/places', { query }),
  resolveZone: (query: ResolveZoneQuery) =>
    http.request<ResolveZoneResultDto>('GET', '/geo/zones/resolve', { query: { ...query } }),
  geocode: (query: GeocodeQuery) =>
    http.request<GeocodeResultDto[]>('GET', '/geo/geocode', { query: { ...query } }),
  reverseGeocode: (lat: number, lng: number) =>
    http.request<GeocodeResultDto | null>('GET', '/geo/reverse-geocode', { query: { lat, lng } }),
});
