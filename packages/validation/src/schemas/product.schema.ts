/**
 * Zod schemas: product.
 */
import { LIMITS, PRODUCT_UNIT, STORE_TAG } from '@bazar/constants';
import { z } from 'zod';
import {
  httpUrl,
  idSchema,
  imageSchema,
  positiveMoneySchema,
  queryBoolean,
  translatedSchema,
} from './common.schema.js';

export const productUnitSchema = z.nativeEnum(PRODUCT_UNIT);

/** Quantities are fractional for weighed goods, so this is not an int. */
export const quantitySchema = z.coerce.number().positive().max(10_000);

/**
 * There is no «old price» to type, here or on an edit: the struck-through price is the lowest of the
 * last week from the price history («честная скидка», `PUT /products/:id/sale`). A number a seller
 * could type would be a number a seller could inflate.
 */
export const createProductSchema = z.object({
  storeId: idSchema,
  categoryId: idSchema.optional(),
  name: translatedSchema,
  description: translatedSchema.optional(),
  unit: productUnitSchema,
  price: positiveMoneySchema,
  minQuantity: quantitySchema.default(1),
  quantityStep: quantitySchema.default(1),
  weightGrams: z.coerce.number().int().positive().max(500_000).optional(),
  // A product without a photograph is not on the counter: the app shows nothing without one.
  images: z.array(imageSchema).min(1).max(LIMITS.PRODUCT_MAX_IMAGES),
  stock: z.coerce.number().min(0).optional(),
});

export const updateProductSchema = createProductSchema
  .partial()
  .omit({ storeId: true })
  .extend({
    // Only null: it ends a sale. A sale is started through `PUT /products/:id/sale`.
    oldPrice: z.null().optional(),
    available: z.boolean().optional(),
    tags: z.array(z.nativeEnum(STORE_TAG)).max(6).optional(),
  });

/** «Честная скидка»: only the new price is typed; the struck-through one comes from the history. */
export const productSaleSchema = z.object({ price: positiveMoneySchema });

/**
 * Quantity prices, all of them at once (an empty list takes them off): from `minQuantity` the
 * line is priced at `price` per unit. The ladder itself (falling, under the list price) is the
 * service's to check against the product — @bazar/storefront tierProblem.
 */
export const productTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        minQuantity: z.number().positive().max(10_000),
        price: positiveMoneySchema,
      }),
    )
    .max(3),
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
  availableOnly: queryBoolean.optional(),
  /** Goods with a struck-through price: the «Скидки» rail. */
  onSale: queryBoolean.optional(),
});

export const createCategorySchema = z.object({
  name: translatedSchema,
  parentId: idSchema.nullable().optional(),
  iconUrl: httpUrl.optional(),
  imageUrl: httpUrl.optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type ProductSaleInput = z.infer<typeof productSaleSchema>;
