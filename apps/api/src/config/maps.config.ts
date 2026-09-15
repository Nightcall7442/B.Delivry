/**
 * Maps configuration slice.
 */
import type { MapProviderId } from '@bazar/maps';
import type { Env } from './env.schema.js';

export interface MapsConfig {
  provider: MapProviderId;
  googleApiKey?: string;
  yandexApiKey?: string;
  dgisApiKey?: string;
  osrmBaseUrl: string;
  /** Vendor calls are on the checkout path: fail fast to a haversine estimate. */
  timeoutMs: number;
  cacheTtlSeconds: number;
}

export function buildMapsConfig(env: Env): MapsConfig {
  return {
    provider: env.MAPS_PROVIDER,
    ...(env.GOOGLE_MAPS_API_KEY !== undefined ? { googleApiKey: env.GOOGLE_MAPS_API_KEY } : {}),
    ...(env.YANDEX_MAPS_API_KEY !== undefined ? { yandexApiKey: env.YANDEX_MAPS_API_KEY } : {}),
    ...(env.DGIS_API_KEY !== undefined ? { dgisApiKey: env.DGIS_API_KEY } : {}),
    osrmBaseUrl: env.OSRM_BASE_URL,
    timeoutMs: 3000,
    cacheTtlSeconds: 3600,
  };
}
