/**
 * Products request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createProductSchema, updateProductSchema } from '@bazar/validation';

import { idSchema, listQuerySchema, productListQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const productIdParamsSchema = z.object({ id: idSchema });

export const productsListQuerySchema = listQuerySchema.merge(productListQuerySchema);

export const setAvailabilitySchema = z.object({ available: z.boolean() });

export type ProductsListQuery = z.infer<typeof productsListQuerySchema>;
