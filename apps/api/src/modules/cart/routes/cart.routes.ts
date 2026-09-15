/**
 * Cart route definitions — mounted by src/routes/index.ts.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { CartController } from '../controller/cart.controller.js';
import {
  addCartItemSchema,
  cartItemParamsSchema,
  storeParamsSchema,
  updateCartItemSchema,
} from '../schemas/index.js';

export function cartRoutes(controller: CartController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requireCustomer);

    // The cart is per store, so the store id is part of the path everywhere
    // except the "show me all my carts" listing.
    app.get('/', controller.list);
    app.post('/items', { preHandler: validate({ body: addCartItemSchema }) }, controller.addItem);

    app.get('/:storeId', { preHandler: validate({ params: storeParamsSchema }) }, controller.get);
    app.delete(
      '/:storeId',
      { preHandler: validate({ params: storeParamsSchema }) },
      controller.clear,
    );

    app.patch(
      '/:storeId/items/:itemId',
      { preHandler: validate({ params: cartItemParamsSchema, body: updateCartItemSchema }) },
      controller.updateItem,
    );
    app.delete(
      '/:storeId/items/:itemId',
      { preHandler: validate({ params: cartItemParamsSchema }) },
      controller.removeItem,
    );
  };
}
