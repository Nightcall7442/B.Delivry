/**
 * /api/v1/reviews - delegates to modules/reviews/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { reviewsRoutes } from '../modules/reviews/index.js';

export function reviewsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(reviewsRoutes(container.controllers.reviews));
  };
}
