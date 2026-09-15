/**
 * Zod schemas: promotion.
 */
import { COUPON_CODE_REGEX } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, isoDateSchema, positiveMoneySchema, translatedSchema } from './common.schema.js';

export const discountTypeSchema = z.enum(['PERCENT', 'FIXED', 'FREE_DELIVERY']);

export const createPromotionSchema = z
  .object({
    name: translatedSchema,
    description: translatedSchema.optional(),
    discountType: discountTypeSchema,
    /** Percent for PERCENT, minor units for FIXED, ignored for FREE_DELIVERY. */
    value: z.coerce.number().nonnegative(),
    maxDiscount: positiveMoneySchema.optional(),
    minOrder: positiveMoneySchema.optional(),
    storeIds: z.array(idSchema).optional(),
    categoryIds: z.array(idSchema).optional(),
    cityIds: z.array(idSchema).optional(),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema.optional(),
  })
  .refine((v) => v.discountType !== 'PERCENT' || v.value <= 100, {
    message: 'Percent discount cannot exceed 100',
    path: ['value'],
  })
  .refine((v) => v.endsAt === undefined || v.endsAt > v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updatePromotionSchema = createPromotionSchema
  .innerType()
  .innerType()
  .partial()
  .extend({ active: z.boolean().optional() });

export const createCouponSchema = z.object({
  promotionId: idSchema,
  code: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX),
  maxRedemptions: z.coerce.number().int().positive().nullable().optional(),
  maxPerCustomer: z.coerce.number().int().positive().default(1),
  customerId: idSchema.nullable().optional(),
  expiresAt: isoDateSchema.optional(),
});

export const applyCouponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX),
  storeId: idSchema,
  subtotal: positiveMoneySchema,
});

export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
