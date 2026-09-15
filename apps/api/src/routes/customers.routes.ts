/**
 * /api/v1/customers - delegates to modules/customers/routes, with addresses nested.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { addressesRoutes } from '../modules/addresses/index.js';
import { customersRoutes } from '../modules/customers/index.js';

export function customersRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(customersRoutes(container.controllers.customers));
    // Addresses belong to a customer, so they live under this prefix rather
    // than as a top-level resource.
    await app.register(addressesRoutes(container.controllers.addresses), {
      prefix: '/me/addresses',
    });
  };
}
