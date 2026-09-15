/**
 * Catalog route definitions — mounted by src/routes/products.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { validate } from '../../../middleware/validation.middleware.js';
import type { CatalogController } from '../controller/catalog.controller.js';
import {
  catalogSearchQuerySchema,
  categoryListQuerySchema,
  productIdParamsSchema,
} from '../schemas/index.js';

export function catalogRoutes(controller: CatalogController) {
  return async (app: FastifyInstance): Promise<void> => {
    // The storefront is public. Prices and availability are the same for
    // everyone, so there is nothing to authorize.
    app.get('/', { preHandler: validate({ query: catalogSearchQuerySchema }) }, controller.search);
    app.get(
      '/categories',
      { preHandler: validate({ query: categoryListQuerySchema }) },
      controller.categories,
    );
    app.get('/:id', { preHandler: validate({ params: productIdParamsSchema }) }, controller.get);
  };
}
