/**
 * /api/v1/support - delegates to modules/support/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { supportRoutes } from '../modules/support/index.js';

export function supportRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(supportRoutes(container.controllers.support));
  };
}
