/**
 * Analytics route definitions — mounted by src/routes/admin.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { AnalyticsController } from '../controller/analytics.controller.js';
import { analyticsQuerySchema, dashboardQuerySchema, demandQuerySchema } from '../schemas/index.js';

export function analyticsRoutes(controller: AnalyticsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Vendors get their own store's numbers through the same permission,
    // scoped by the storeId filter the service applies.
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requirePermission(PERMISSION.ANALYTICS_READ));

    app.get(
      '/dashboard',
      { preHandler: validate({ query: dashboardQuerySchema }) },
      controller.dashboard,
    );
    app.get('/sales', { preHandler: validate({ query: analyticsQuerySchema }) }, controller.sales);
    app.get('/demand', { preHandler: validate({ query: demandQuerySchema }) }, controller.demand);
    app.get(
      '/top-stores',
      { preHandler: validate({ query: analyticsQuerySchema }) },
      controller.topStores,
    );
    app.get(
      '/couriers',
      { preHandler: validate({ query: analyticsQuerySchema }) },
      controller.couriers,
    );
  };
}
