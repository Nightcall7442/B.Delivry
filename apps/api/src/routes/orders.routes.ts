/**
 * /api/v1/orders - delegates to modules/orders/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { ordersRoutes } from '../modules/orders/index.js';

export function ordersRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(ordersRoutes(container.controllers.orders));
  };
}
