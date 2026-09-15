/**
 * /api/v1/notifications - delegates to modules/notifications/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { notificationsRoutes } from '../modules/notifications/index.js';

export function notificationsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(notificationsRoutes(container.controllers.notifications));
  };
}
