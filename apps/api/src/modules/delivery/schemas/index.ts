/**
 * Delivery request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { DELIVERY_STATUS } from '@bazar/constants';
import { idSchema, isoDateSchema, latSchema, lngSchema, listQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const deliveryIdParamsSchema = z.object({ id: idSchema });

export const deliveryListQuerySchema = listQuerySchema.extend({
  status: z.nativeEnum(DELIVERY_STATUS).optional(),
  courierId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** The courier app sends its position with the action, for the arrival check. */
const point = { lat: latSchema.optional(), lng: lngSchema.optional() };

export const acceptDeliverySchema = z.object(point);

export const completeDeliverySchema = z.object({
  ...point,
  proofUrl: z.string().url().max(500).optional(),
  handoverCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/)
    .optional(),
});

export const failDeliverySchema = z.object({
  reason: z.string().trim().min(3).max(500),
  photoUrl: z.string().url().max(500).optional(),
});

export const assignDeliverySchema = z.object({ courierId: idSchema });

export const releaseDeliverySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
export type CompleteDeliveryInput = z.infer<typeof completeDeliverySchema>;
