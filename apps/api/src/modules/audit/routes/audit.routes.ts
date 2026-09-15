/**
 * Audit route definitions — mounted by src/routes/admin.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { AuditController } from '../controller/audit.controller.js';
import { auditListQuerySchema, auditTrailParamsSchema } from '../schemas/index.js';

export function auditRoutes(controller: AuditController) {
  return async (app: FastifyInstance): Promise<void> => {
    // The audit trail is staff-only, top to bottom.
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requirePermission(PERMISSION.AUDIT_READ));

    app.get('/', { preHandler: validate({ query: auditListQuerySchema }) }, controller.list);

    app.get(
      '/:entity/:entityId',
      { preHandler: validate({ params: auditTrailParamsSchema }) },
      controller.trail,
    );
  };
}
