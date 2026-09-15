/**
 * Zod schemas: address.
 */
import { z } from 'zod';
import { idSchema, optionalText } from './common.schema.js';
import { latLngSchema } from './geo.schema.js';

export const addressLabelSchema = z.enum(['HOME', 'WORK', 'OTHER']);

/**
 * Only the city is mandatory. Uzbek addresses are often described by landmark
 * rather than street and number, so requiring a house would block real users;
 * the courier gets there with `landmark`, `instructions` and the map pin.
 */
export const createAddressSchema = z
  .object({
    label: addressLabelSchema.default('HOME'),
    title: optionalText(64),
    cityId: idSchema,
    districtId: idSchema.optional(),
    mahallaId: idSchema.optional(),
    street: optionalText(120),
    house: optionalText(32),
    apartment: optionalText(32),
    entrance: optionalText(16),
    floor: optionalText(16),
    intercom: optionalText(32),
    landmark: optionalText(200),
    instructions: optionalText(500),
    point: latLngSchema.optional(),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.point !== undefined || value.street !== undefined || value.landmark !== undefined,
    'Provide a map pin, a street or a landmark so the courier can find the address',
  );

export const updateAddressSchema = createAddressSchema.innerType().partial();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
