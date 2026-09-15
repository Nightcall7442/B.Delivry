/**
 * Products route definitions — mounted by src/routes/products.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { ProductsController } from '../controller/products.controller.js';
import {
  createProductSchema,
  productIdParamsSchema,
  productsListQuerySchema,
  setAvailabilitySchema,
  updateProductSchema,
} from '../schemas/index.js';

export function productsRoutes(controller: ProductsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Vendor-side catalogue management. Customer browsing lives in the catalog
    // module, which is public; everything here writes and needs an account.
    app.addHook('preHandler', requireAuth);

    const canWrite = requirePermission(PERMISSION.PRODUCT_WRITE);

    app.get('/', { preHandler: validate({ query: productsListQuerySchema }) }, controller.list);
    app.get('/:id', { preHandler: validate({ params: productIdParamsSchema }) }, controller.get);

    app.post(
      '/',
      { preHandler: [canWrite, validate({ body: createProductSchema })] },
      controller.create,
    );
    app.patch(
      '/:id',
      {
        preHandler: [
          canWrite,
          validate({ params: productIdParamsSchema, body: updateProductSchema }),
        ],
      },
      controller.update,
    );
    app.put(
      '/:id/availability',
      {
        preHandler: [
          canWrite,
          validate({ params: productIdParamsSchema, body: setAvailabilitySchema }),
        ],
      },
      controller.setAvailability,
    );
    app.get(
      '/:id/price-history',
      { preHandler: [canWrite, validate({ params: productIdParamsSchema })] },
      controller.priceHistory,
    );
    app.delete(
      '/:id',
      { preHandler: [canWrite, validate({ params: productIdParamsSchema })] },
      controller.remove,
    );
  };
}
