/**
 * Favorites route definitions — mounted by src/routes/customers.routes.ts under /me/favorites.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { FavoritesController } from '../controller/favorites.controller.js';
import { favoriteProductParamsSchema, favoriteStoreParamsSchema } from '../schemas/index.js';

export function favoritesRoutes(controller: FavoritesController) {
  return async (app: FastifyInstance): Promise<void> => {
    // The caller's own hearts: the service reads the owner from the context, no route takes one.
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requireCustomer);

    app.get('/', controller.list);
    // PUT and DELETE, both idempotent: a double tap or a retried request lands where it meant to.
    const product = { preHandler: validate({ params: favoriteProductParamsSchema }) };
    app.put('/products/:productId', product, controller.addProduct);
    app.delete('/products/:productId', product, controller.removeProduct);
    const store = { preHandler: validate({ params: favoriteStoreParamsSchema }) };
    app.put('/stores/:storeId', store, controller.addStore);
    app.delete('/stores/:storeId', store, controller.removeStore);
  };
}
