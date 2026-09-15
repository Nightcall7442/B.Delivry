/**
 * Pricing request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { COUPON_CODE_REGEX } from '@bazar/constants';
import {
  idSchema,
  latSchema,
  lngSchema,
  listQuerySchema,
  positiveMoneySchema,
} from '@bazar/validation';
import { z } from 'zod';

export const quoteRequestSchema = z
  .object({
    storeId: idSchema,
    addressId: idSchema.optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    couponCode: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX).optional(),
  })
  .refine(
    (value) =>
      value.addressId !== undefined || (value.lat !== undefined && value.lng !== undefined),
    'Provide either an address id or a lat/lng pair',
  );

export const tariffListQuerySchema = listQuerySchema.extend({
  cityId: idSchema.optional(),
});

export const createTariffSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cityId: idSchema.optional(),
  base: positiveMoneySchema,
  perKm: positiveMoneySchema,
  freeDistanceMeters: z.coerce.number().int().min(0).max(50_000).default(0),
  minFee: positiveMoneySchema,
  maxFee: positiveMoneySchema.optional(),
  commissionPercent: z.coerce.number().min(0).max(100).default(0),
  serviceFee: positiveMoneySchema.optional(),
  freeDeliveryThreshold: positiveMoneySchema.optional(),
  minOrder: positiveMoneySchema.optional(),
});

export const updateTariffSchema = createTariffSchema.partial().extend({
  active: z.boolean().optional(),
});

const minuteOfDay = z.coerce
  .number()
  .int()
  .min(0)
  .max(24 * 60);

export const createSurgeRuleSchema = z.object({
  tariffId: idSchema,
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  fromMinute: minuteOfDay,
  toMinute: minuteOfDay,
  // Below 1 it would be a discount, not surge; above 3 it is almost certainly
  // a typo that would price an order out of reach.
  multiplier: z.coerce.number().min(1).max(3),
});

export const idParamsSchema = z.object({ id: idSchema });

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type CreateTariffInput = z.infer<typeof createTariffSchema>;
