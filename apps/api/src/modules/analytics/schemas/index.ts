/**
 * Analytics request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, isoDateSchema } from '@bazar/validation';
import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  cityId: idSchema.optional(),
  storeId: idSchema.optional(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const dashboardQuerySchema = z.object({ cityId: idSchema.optional() });

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;

export const demandQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  storeId: idSchema.optional(),
});

export const recordDemandSchema = z.object({
  query: z.string().trim().min(1).max(120),
  results: z.coerce.number().int().min(0).max(10_000),
  source: z.enum(['search', 'list']),
  storeId: idSchema.optional(),
});
