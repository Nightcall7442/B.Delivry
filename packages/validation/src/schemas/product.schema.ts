/**
 * Zod schemas: product.
 */
import { LIMITS, PRODUCT_UNIT, STORE_TAG } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, imageSchema, positiveMoneySchema, translatedSchema } from './common.schema.js';

export const productUnitSchema = z.nativeEnum(PRODUCT_UNIT);

/** Quantities are fractional for weighed goods, so this is not an int. */
export const quantitySchema = z.coerce.number().positive().max(10_000);

export const createProductSchema = z
  .object({
    storeId: idSchema,
    categoryId: idSchema.optional(),
    name: translatedSchema,
    description: translatedSchema.optional(),
    unit: productUnitSchema,
    price: positiveMoneySchema,
    oldPrice: positiveMoneySchema.optional(),
    minQuantity: quantitySchema.default(1),
    quantityStep: quantitySchema.default(1),
    weightGrams: z.coerce.number().int().positive().max(500_000).optional(),
    // A product without a photograph is not on the counter: the app shows nothing without one.
    images: z.array(imageSchema).min(1).max(LIMITS.PRODUCT_MAX_IMAGES),
    stock: z.coerce.number().min(0).optional(),
  })
  .refine((v) => v.oldPrice === undefined || v.oldPrice.amount > v.price.amount, {
    message: 'oldPrice must be higher than price',
    path: ['oldPrice'],
  });

export const updateProductSchema = createProductSchema
  .innerType()
  .partial()
  .omit({ storeId: true })
  .extend({
    available: z.boolean().optional(),
    tags: z.array(z.nativeEnum(STORE_TAG)).max(6).optional(),
  });

export const productListQuerySchema = z.object({
  /** The basket's products by id (`ids=a&ids=b`); a lone value arrives as a string. */
  ids: z
    .preprocess(
      (v) => (typeof v === 'string' ? [v] : v),
      z.array(idSchema).max(LIMITS.CART_MAX_ITEMS),
    )
    .optional(),
  storeId: idSchema.optional(),
  categoryId: idSchema.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  availableOnly: z.coerce.boolean().optional(),
});

export const createCategorySchema = z.object({
  name: translatedSchema,
  parentId: idSchema.nullable().optional(),
  iconUrl: z.string().url().max(500).optional(),
  imageUrl: z.string().url().max(500).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type CreateProductInput = z.infer<typeof createProductSchema>;
