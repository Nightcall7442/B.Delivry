/**
 * /api/v1/vendors - delegates to modules/vendors/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { vendorsRoutes } from '../modules/vendors/index.js';

export function vendorsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(vendorsRoutes(container.controllers.vendors));
  };
}
