/**
 * Zod schemas: cart.
 */
import { LIMITS } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, optionalText } from './common.schema.js';
import { quantitySchema } from './product.schema.js';

export const addCartItemSchema = z.object({
  storeId: idSchema,
  productId: idSchema,
  quantity: quantitySchema.max(LIMITS.CART_MAX_QTY_PER_ITEM),
  /** Note to the seller: "riper ones please". */
  comment: optionalText(200),
});

export const updateCartItemSchema = z.object({
  quantity: quantitySchema.max(LIMITS.CART_MAX_QTY_PER_ITEM),
  comment: optionalText(200),
});

export const cartQuerySchema = z.object({
  storeId: idSchema.optional(),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
