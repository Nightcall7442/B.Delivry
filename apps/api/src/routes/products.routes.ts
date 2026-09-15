/**
 * /api/v1/products - delegates to modules/products/routes, with catalog and categories.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { catalogRoutes } from '../modules/catalog/index.js';
import { categoriesRoutes } from '../modules/categories/index.js';
import { productsRoutes } from '../modules/products/index.js';

export function productsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    // Two sides of the same data: /catalog is the public storefront read model,
    // /products is the vendor's own management API. They are separate because
    // one is public and cacheable and the other is not.
    await app.register(catalogRoutes(container.controllers.catalog), { prefix: '/catalog' });
    await app.register(categoriesRoutes(container.controllers.categories), {
      prefix: '/categories',
    });
    await app.register(productsRoutes(container.controllers.products), { prefix: '/products' });
  };
}
