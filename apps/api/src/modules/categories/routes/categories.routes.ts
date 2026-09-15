/**
 * Categories route definitions — mounted by src/routes/products.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { CategoriesController } from '../controller/categories.controller.js';
import {
  categoryIdParamsSchema,
  childrenQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '../schemas/index.js';

export function categoriesRoutes(controller: CategoriesController) {
  return async (app: FastifyInstance): Promise<void> => {
    // The tree drives the storefront navigation, so reads are public.
    app.get('/', controller.tree);
    app.get(
      '/children',
      { preHandler: validate({ query: childrenQuerySchema }) },
      controller.children,
    );
    app.get('/:id', { preHandler: validate({ params: categoryIdParamsSchema }) }, controller.get);
    app.get(
      '/:id/subtree',
      { preHandler: validate({ params: categoryIdParamsSchema }) },
      controller.subtree,
    );

    const canWrite = [requireAuth, requirePermission(PERMISSION.CATEGORY_WRITE)];

    app.post(
      '/',
      { preHandler: [...canWrite, validate({ body: createCategorySchema })] },
      controller.create,
    );
    app.patch(
      '/:id',
      {
        preHandler: [
          ...canWrite,
          validate({ params: categoryIdParamsSchema, body: updateCategorySchema }),
        ],
      },
      controller.update,
    );
    app.delete(
      '/:id',
      { preHandler: [...canWrite, validate({ params: categoryIdParamsSchema })] },
      controller.deactivate,
    );
  };
}
