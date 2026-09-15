/**
 * Cart subscriptions: "this order, every <weekday> at <slot>".
 */
import { DELIVERY_SLOT_HOURS } from '@bazar/constants';
import { z } from 'zod';

import { idSchema } from './common.schema.js';

export const createSubscriptionSchema = z.object({
  /** The basket, address and payment method are copied from this order. */
  orderId: idSchema,
  /** Local weekday, 0 = Sunday … 6 = Saturday. */
  weekday: z.number().int().min(0).max(6),
  hour: z.union(
    DELIVERY_SLOT_HOURS.map((hour) => z.literal(hour)) as [
      z.ZodLiteral<number>,
      z.ZodLiteral<number>,
      ...z.ZodLiteral<number>[],
    ],
  ),
});

export const updateSubscriptionSchema = z.object({
  active: z.boolean().optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  hour: z
    .union(
      DELIVERY_SLOT_HOURS.map((hour) => z.literal(hour)) as [
        z.ZodLiteral<number>,
        z.ZodLiteral<number>,
        ...z.ZodLiteral<number>[],
      ],
    )
    .optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
