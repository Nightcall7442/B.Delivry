/**
 * /api/v1/admin - delegates to modules/admin/routes, with analytics and the audit trail.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { adminRoutes } from '../modules/admin/index.js';
import { analyticsRoutes } from '../modules/analytics/index.js';
import { auditRoutes } from '../modules/audit/index.js';

export function adminRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(adminRoutes(container.controllers.admin));
    await app.register(analyticsRoutes(container.controllers.analytics), { prefix: '/analytics' });
    await app.register(auditRoutes(container.controllers.audit), { prefix: '/audit' });
  };
}
