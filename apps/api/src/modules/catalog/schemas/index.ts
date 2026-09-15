/**
 * Catalog request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, listQuerySchema, productListQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const catalogSearchQuerySchema = listQuerySchema.merge(productListQuerySchema);

export const productIdParamsSchema = z.object({ id: idSchema });

export const categoryListQuerySchema = z.object({
  parentId: idSchema.optional(),
  /** Explicitly ask for top-level categories. */
  root: z.coerce.boolean().optional(),
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;
