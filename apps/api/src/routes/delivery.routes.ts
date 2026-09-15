/**
 * /api/v1/delivery - delegates to modules/delivery/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { deliveryRoutes } from '../modules/delivery/index.js';

export function deliveryRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(deliveryRoutes(container.controllers.delivery));
  };
}
