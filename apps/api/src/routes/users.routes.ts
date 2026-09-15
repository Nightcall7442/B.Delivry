/**
 * /api/v1/users - delegates to modules/users/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { usersRoutes } from '../modules/users/index.js';

export function usersRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(usersRoutes(container.controllers.users));
  };
}
