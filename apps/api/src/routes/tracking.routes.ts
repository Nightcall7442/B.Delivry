/**
 * /api/v1/tracking - delegates to modules/tracking/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { trackingRoutes } from '../modules/tracking/index.js';

export function trackingRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(trackingRoutes(container.controllers.tracking));
  };
}
