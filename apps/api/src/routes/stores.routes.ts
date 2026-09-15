/**
 * /api/v1/stores - delegates to modules/stores/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { storesRoutes } from '../modules/stores/index.js';

export function storesRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(storesRoutes(container.controllers.stores));
  };
}
