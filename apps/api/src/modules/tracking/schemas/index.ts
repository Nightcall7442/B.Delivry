/**
 * Tracking request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, isoDateSchema, latSchema, lngSchema } from '@bazar/validation';
import { z } from 'zod';

const pingSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  heading: z.coerce.number().min(0).max(360).optional(),
  speedKmh: z.coerce.number().min(0).max(300).optional(),
  accuracyMeters: z.coerce.number().min(0).max(10_000).optional(),
  recordedAt: isoDateSchema.optional(),
  orderId: idSchema.optional(),
});

export const pushLocationSchema = pingSchema;

/**
 * Batched upload: the courier app buffers while offline and sends the backlog
 * when signal returns, which is normal in bazaar basements.
 */
export const pushLocationBatchSchema = z.object({
  points: z.array(pingSchema).min(1).max(200),
});

export const trackOrderParamsSchema = z.object({ orderId: idSchema });

export const historyQuerySchema = z
  .object({
    orderId: idSchema.optional(),
    courierId: idSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(2000).optional(),
  })
  .refine(
    (value) => value.orderId !== undefined || value.courierId !== undefined,
    'Provide an orderId or a courierId',
  );

export const liveMapQuerySchema = z.object({ cityId: idSchema });

export type PushLocationInput = z.infer<typeof pushLocationSchema>;
export type PushLocationBatchInput = z.infer<typeof pushLocationBatchSchema>;
