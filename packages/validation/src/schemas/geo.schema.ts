/**
 * Zod schemas: geo.
 */
import { GEO_LEVEL } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, translatedSchema } from './common.schema.js';

export const latSchema = z.coerce.number().min(-90).max(90);
export const lngSchema = z.coerce.number().min(-180).max(180);

export const latLngSchema = z.object({ lat: latSchema, lng: lngSchema });

/** GeoJSON position is [lng, lat] — the opposite order of everything else here. */
export const positionSchema = z.tuple([lngSchema, latSchema]);

/**
 * A polygon ring needs at least 4 positions because the first one is repeated
 * as the last; anything shorter cannot enclose an area.
 */
export const polygonRingSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    return (
      first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
    );
  }, 'Polygon ring must be closed (first point repeated last)');

export const polygonSchema = z.array(polygonRingSchema).min(1);

export const geoPlaceSchema = z.object({
  level: z.nativeEnum(GEO_LEVEL),
  code: z.string().trim().min(1).max(32),
  name: translatedSchema,
  parentId: idSchema.nullable().optional(),
  center: latLngSchema.optional(),
});

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cityId: idSchema,
  polygon: polygonSchema,
  tariffId: idSchema,
  priority: z.coerce.number().int().min(0).default(0),
});

export const resolveZoneQuerySchema = z.object({ lat: latSchema, lng: lngSchema });

export const geocodeQuerySchema = z.object({
  query: z.string().trim().min(2).max(200),
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});
