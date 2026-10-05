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
  productSaleSchema,
  productTiersSchema,
  productsListQuerySchema,
  setAvailabilitySchema,
  updateProductSchema,
} from '../schemas/index.js';

export function productsRoutes(controller: ProductsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Vendor-side catalogue management. Customer browsing lives in the catalog
    // module, which is public; everything here writes and needs an account. The two reads are the
    // seller's own shelf: every good of their own stalls, and for anyone else only what the shop
    // window shows (see catalog/domain/visibility).
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
    // «Честная скидка»: the new price only; the struck-through one comes from the price history.
    app.put(
      '/:id/sale',
      {
        preHandler: [
          canWrite,
          validate({ params: productIdParamsSchema, body: productSaleSchema }),
        ],
      },
      controller.startSale,
    );
    app.delete(
      '/:id/sale',
      { preHandler: [canWrite, validate({ params: productIdParamsSchema })] },
      controller.endSale,
    );
    // Quantity prices — «от 10 кг по 16 000», «3 шт за 10 000» — all at once; [] takes them off.
    app.put(
      '/:id/tiers',
      {
        preHandler: [
          canWrite,
          validate({ params: productIdParamsSchema, body: productTiersSchema }),
        ],
      },
      controller.setTiers,
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
