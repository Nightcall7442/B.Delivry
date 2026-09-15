/**
 * Geo request/response Zod schemas (reuse @bazar/validation where shared).
 */
export {
  deliveryZoneSchema,
  geoPlaceSchema,
  geocodeQuerySchema,
  latLngSchema,
  polygonSchema,
  resolveZoneQuerySchema,
} from '@bazar/validation';

import { GEO_LEVEL } from '@bazar/constants';
import { idSchema, latSchema, lngSchema } from '@bazar/validation';
import { z } from 'zod';

export const placeListQuerySchema = z.object({
  level: z.nativeEnum(GEO_LEVEL).optional(),
  parentId: idSchema.optional(),
});

export const zoneListQuerySchema = z.object({ cityId: idSchema });

export const updateZoneSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  polygon: z
    .array(z.array(z.tuple([lngSchema, latSchema])).min(4))
    .min(1)
    .optional(),
  tariffId: idSchema.optional(),
  priority: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const idParamsSchema = z.object({ id: idSchema });

export type PlaceListQuery = z.infer<typeof placeListQuerySchema>;
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;
