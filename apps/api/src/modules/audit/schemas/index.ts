/**
 * Audit request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { idSchema, isoDateSchema, listQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const auditListQuerySchema = listQuerySchema.extend({
  actorId: idSchema.optional(),
  entity: z.string().trim().max(64).optional(),
  entityId: idSchema.optional(),
  action: z.string().trim().max(64).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const auditTrailParamsSchema = z.object({
  entity: z.string().trim().min(1).max(64),
  entityId: idSchema,
});

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
