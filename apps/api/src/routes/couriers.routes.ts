/**
 * /api/v1/couriers - delegates to modules/couriers/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { couriersRoutes } from '../modules/couriers/index.js';

export function couriersRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(couriersRoutes(container.controllers.couriers));
  };
}
