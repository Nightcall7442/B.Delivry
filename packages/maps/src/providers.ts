/**
 * MapProviderId union: google | yandex | dgis | osm.
 */
export const MAP_PROVIDER = {
  GOOGLE: 'google',
  YANDEX: 'yandex',
  DGIS: '2gis',
  OSM: 'osm',
} as const;

export type MapProviderId = (typeof MAP_PROVIDER)[keyof typeof MAP_PROVIDER];

export const ALL_MAP_PROVIDERS = Object.values(MAP_PROVIDER);
