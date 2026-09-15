/**
 * Zod schemas: store.
 */
import { STORE_STATUS, STORE_TAG, STORE_TYPE } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, optionalText, translatedSchema } from './common.schema.js';
import { latLngSchema } from './geo.schema.js';
import { phoneSchema } from './phone.schema.js';

const minuteOfDay = z.coerce
  .number()
  .int()
  .min(0)
  .max(24 * 60);

export const storeScheduleSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    opensAt: minuteOfDay,
    closesAt: minuteOfDay,
    closed: z.boolean().default(false),
  })
  .refine((v) => v.closed || v.opensAt < v.closesAt, 'opensAt must be before closesAt');

export const createStoreSchema = z.object({
  vendorId: idSchema,
  type: z.nativeEnum(STORE_TYPE),
  name: translatedSchema,
  description: translatedSchema.optional(),
  phone: phoneSchema.optional(),
  cityId: idSchema,
  address: optionalText(300),
  point: latLngSchema.optional(),
  /** Row/stall number at the bazaar: what the courier actually looks for. */
  standNumber: optionalText(32),
  preparationMinutes: z.coerce.number().int().min(0).max(240).default(15),
  schedule: z.array(storeScheduleSchema).max(7).optional(),
});

export const updateStoreSchema = createStoreSchema
  .partial()
  .omit({ vendorId: true })
  .extend({
    status: z.nativeEnum(STORE_STATUS).optional(),
    logoUrl: z.string().url().max(500).nullable().optional(),
    coverUrl: z.string().url().max(500).nullable().optional(),
    /** Today's photo of the counter; the date is stamped by the server. */
    counterPhotoUrl: z.string().url().max(500).nullable().optional(),
    tags: z.array(z.nativeEnum(STORE_TAG)).max(6).optional(),
    ownerName: z.string().trim().min(1).max(80).nullable().optional(),
    ownerSince: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
    ownerPhotoUrl: z.string().url().max(500).nullable().optional(),
    ownerMotto: translatedSchema.nullable().optional(),
  });

export const storeListQuerySchema = z.object({
  cityId: idSchema.optional(),
  type: z.nativeEnum(STORE_TYPE).optional(),
  categoryId: idSchema.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(100).max(50_000).optional(),
  openNow: z.coerce.boolean().optional(),
  /** Vendor cabinet: only the caller's own stalls, whatever their status. */
  mine: z.coerce.boolean().optional(),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
