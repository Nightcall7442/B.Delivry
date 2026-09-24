/**
 * Zod schemas: order.
 */
import {
  COUPON_CODE_REGEX,
  LIMITS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  SUBSTITUTION_POLICY,
} from '@bazar/constants';
import { z } from 'zod';
import { latLngSchema } from './geo.schema.js';
import { idSchema, isoDateSchema, optionalText } from './common.schema.js';
import { phoneSchema } from './phone.schema.js';
import { quantitySchema } from './product.schema.js';

export const orderStatusSchema = z.nativeEnum(ORDER_STATUS);

export const orderItemInputSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  comment: optionalText(200),
});

export const createOrderSchema = z.object({
  storeId: idSchema,
  addressId: idSchema,
  paymentMethod: z.nativeEnum(PAYMENT_METHOD),
  comment: optionalText(500),
  /** For the vendor, not the courier: how ripe, how big, which cut. */
  vendorComment: optionalText(500),
  substitutionPolicy: z.nativeEnum(SUBSTITUTION_POLICY).optional(),
  couponCode: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX).optional(),
  /** ISO time for a scheduled delivery; omit for "as soon as possible". */
  scheduledFor: isoDateSchema.optional(),
  /** Somebody else opens the door (parents, a neighbour): the courier calls them. */
  recipientName: optionalText(80),
  recipientPhone: phoneSchema.optional(),
  /** Omit to take the current cart for that store. */
  items: z.array(orderItemInputSchema).min(1).max(LIMITS.ORDER_MAX_ITEMS).optional(),
});

/** Cross-bazaar: one trip, one order per stall (stalls must be within a bazaar of each other). */
const groupEntrySchema = z.object({
  storeId: idSchema,
  items: z.array(orderItemInputSchema).min(1).max(LIMITS.ORDER_MAX_ITEMS),
});
export const createGroupOrderSchema = createOrderSchema
  .omit({ storeId: true, items: true })
  .extend({ stores: z.array(groupEntrySchema).min(2).max(5) });
export const quoteGroupOrderSchema = z
  .object({
    addressId: idSchema.optional(),
    point: latLngSchema.optional(),
    couponCode: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX).optional(),
    stores: z.array(groupEntrySchema).min(2).max(5),
    scheduledFor: isoDateSchema.optional(),
  })
  .refine((value) => value.addressId !== undefined || value.point !== undefined, {
    message: 'addressId or point is required',
    path: ['point'],
  });

/** A price check before checkout: by saved address or by a bare map point. */
export const quoteOrderSchema = z
  .object({
    storeId: idSchema,
    addressId: idSchema.optional(),
    point: latLngSchema.optional(),
    couponCode: z.string().trim().toUpperCase().regex(COUPON_CODE_REGEX).optional(),
    items: z.array(orderItemInputSchema).min(1).max(LIMITS.ORDER_MAX_ITEMS).optional(),
    /** The slot the basket is for: the store is judged open or shut at that hour. */
    scheduledFor: isoDateSchema.optional(),
  })
  .refine((value) => value.addressId !== undefined || value.point !== undefined, {
    message: 'addressId or point is required',
    path: ['point'],
  });

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const changeOrderStatusSchema = z.object({
  status: orderStatusSchema,
  comment: optionalText(500),
});

/** Weighed goods: what the courier actually bought, which reprices the order. */
export const actualQuantitiesSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: idSchema,
        actualQuantity: quantitySchema,
        /** The scale, photographed: what the customer sees next to the weight. */
        photoUrl: z.string().url().max(500).optional(),
      }),
    )
    .min(1)
    .max(LIMITS.ORDER_MAX_ITEMS),
});

export const orderListQuerySchema = z.object({
  status: z.union([orderStatusSchema, z.array(orderStatusSchema)]).optional(),
  customerId: idSchema.optional(),
  courierId: idSchema.optional(),
  storeId: idSchema.optional(),
  cityId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  activeOnly: z.coerce.boolean().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>;
