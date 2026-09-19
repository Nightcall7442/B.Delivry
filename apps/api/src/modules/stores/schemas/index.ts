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

/** The spreadsheet as text: the cabinet reads the file and posts it (≤ 2 MB). */
export const importCsvSchema = z.object({ csv: z.string().min(1).max(2_000_000) });

/** Report window, ISO dates; defaults to the current month. */
export const reportQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
