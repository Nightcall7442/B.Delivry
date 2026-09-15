/**
 * City/region CODES only (data itself lives in DB). No hardcoded lists of cities here.
 */

/** Region codes follow the ISO 3166-2:UZ subdivision codes. */
export type RegionCode = string;
export type CityCode = string;

export const GEO_LEVEL = {
  REGION: 'REGION',
  CITY: 'CITY',
  DISTRICT: 'DISTRICT',
  MAHALLA: 'MAHALLA',
} as const;

export type GeoLevel = (typeof GEO_LEVEL)[keyof typeof GEO_LEVEL];

/** Parent level for each geo level; REGION has none. */
export const GEO_PARENT_LEVEL: Record<GeoLevel, GeoLevel | null> = {
  REGION: null,
  CITY: GEO_LEVEL.REGION,
  DISTRICT: GEO_LEVEL.CITY,
  MAHALLA: GEO_LEVEL.DISTRICT,
};
