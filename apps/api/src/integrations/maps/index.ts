/**
 * MapProvider factory (config.maps.provider).
 */
import type { MapProvider } from '@bazar/maps';
import type { MapsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { DgisMapProvider } from './providers/dgis.provider.js';
import { GoogleMapProvider } from './providers/google.provider.js';
import { OsmMapProvider } from './providers/osm.provider.js';
import { YandexMapProvider } from './providers/yandex.provider.js';

export * from './map-provider.interface.js';

/**
 * One provider per process, chosen by config. The env schema already refuses
 * to boot when a provider is selected without its key, so a missing key here
 * would be a bug rather than a runtime condition to handle.
 */
export function createMapProvider(config: MapsConfig, logger: Logger): MapProvider {
  switch (config.provider) {
    case 'google':
      return new GoogleMapProvider(config, logger, config.googleApiKey as string);
    case 'yandex':
      return new YandexMapProvider(config, logger, config.yandexApiKey as string);
    case '2gis':
      return new DgisMapProvider(config, logger, config.dgisApiKey as string);
    case 'osm':
    default:
      // Default and fallback: costs nothing per call, which matters when every
      // checkout asks for a distance.
      return new OsmMapProvider(config, logger);
  }
}
