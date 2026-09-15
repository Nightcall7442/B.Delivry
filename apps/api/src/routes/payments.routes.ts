/**
 * /api/v1/payments - delegates to modules/payments/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { paymentsRoutes } from '../modules/payments/index.js';

export function paymentsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(paymentsRoutes(container.controllers.payments));
  };
}
