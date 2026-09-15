/**
 * /api/v1/auth - delegates to modules/auth/routes.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { authRoutes } from '../modules/auth/index.js';

export function authRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    // Auth carries its own rate limits, keyed on the phone number rather than
    // the caller, so it needs the limiter and the security config.
    await app.register(
      authRoutes({
        controller: container.controllers.auth,
        limiter: container.limiter,
        security: container.config.security,
      }),
    );
  };
}
