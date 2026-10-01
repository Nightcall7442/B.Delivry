/**
 * Categories request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createCategorySchema, updateCategorySchema } from '@bazar/validation';

import { idSchema, queryBoolean } from '@bazar/validation';
import { z } from 'zod';

export const categoryIdParamsSchema = z.object({ id: idSchema });

/** The whole tree, or only the shelves with goods on sale in one store. */
export const treeQuerySchema = z.object({ storeId: idSchema.optional() });

export const childrenQuerySchema = z.object({
  parentId: idSchema.optional(),
  /** Explicitly ask for the top level, which is parentId === null. */
  root: queryBoolean.optional(),
});
