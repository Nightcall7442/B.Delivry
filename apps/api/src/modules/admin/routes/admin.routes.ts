/**
 * Admin route definitions — mounted by src/routes/admin.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { AdminController } from '../controller/admin.controller.js';
import { updateBrandingSchema, updateSettingsSchema } from '../schemas/index.js';

export function adminRoutes(controller: AdminController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    // Operators watch the wall; only admins change what the platform does.
    app.get(
      '/monitoring',
      { preHandler: requirePermission(PERMISSION.ORDER_READ_ANY) },
      controller.monitoring,
    );

    const canConfigure = requirePermission(PERMISSION.SETTINGS_WRITE);

    app.get('/tenant', { preHandler: canConfigure }, controller.tenant);
    app.patch(
      '/tenant/branding',
      { preHandler: [canConfigure, validate({ body: updateBrandingSchema })] },
      controller.updateBranding,
    );
    app.get('/settings', { preHandler: canConfigure }, controller.settings);
    app.patch(
      '/settings',
      { preHandler: [canConfigure, validate({ body: updateSettingsSchema })] },
      controller.updateSettings,
    );
  };
}
