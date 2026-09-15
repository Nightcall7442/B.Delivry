/**
 * Categories request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createCategorySchema, updateCategorySchema } from '@bazar/validation';

import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const categoryIdParamsSchema = z.object({ id: idSchema });

export const childrenQuerySchema = z.object({
  parentId: idSchema.optional(),
  /** Explicitly ask for the top level, which is parentId === null. */
  root: z.coerce.boolean().optional(),
});
