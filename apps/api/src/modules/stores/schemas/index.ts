/**
 * Stores request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createStoreSchema, storeScheduleSchema, updateStoreSchema } from '@bazar/validation';

import { STORE_STATUS } from '@bazar/constants';
import {
  idSchema,
  listQuerySchema,
  storeListQuerySchema,
  storeScheduleSchema,
} from '@bazar/validation';
import { z } from 'zod';

export const storesListQuerySchema = listQuerySchema.merge(storeListQuerySchema).extend({
  vendorId: idSchema.optional(),
  status: z.nativeEnum(STORE_STATUS).optional(),
});

export const setScheduleSchema = z.object({
  schedule: z.array(storeScheduleSchema).min(1).max(7),
});

export const storeIdParamsSchema = z.object({ id: idSchema });

export type StoresListQuery = z.infer<typeof storesListQuerySchema>;
