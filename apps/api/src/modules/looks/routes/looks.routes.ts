/**
 * /api/v1/looks — «Покажите товар», both sides, and the good's fresh photos for anyone.
 */
import { answerLookSchema, askLookSchema, idSchema } from '@bazar/validation';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { LooksController } from '../controller/looks.controller.js';

const idParams = z.object({ id: idSchema });
const productParams = z.object({ productId: idSchema });
const storeQuery = z.object({ storeId: idSchema });
const mineQuery = z.object({ productId: idSchema.optional() });

export function looksRoutes(controller: LooksController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Public: the photos are of the good, like its price.
    app.get(
      '/product/:productId',
      { preHandler: validate({ params: productParams }) },
      controller.livePhotos,
    );

    app.post(
      '/',
      { preHandler: [requireAuth, requireCustomer, validate({ body: askLookSchema })] },
      controller.ask,
    );
    app.get(
      '/mine',
      { preHandler: [requireAuth, requireCustomer, validate({ query: mineQuery })] },
      controller.mine,
    );
    app.get(
      '/',
      { preHandler: [requireAuth, validate({ query: storeQuery })] },
      controller.forStore,
    );
    app.post(
      '/:id/answer',
      { preHandler: [requireAuth, validate({ params: idParams, body: answerLookSchema })] },
      controller.answer,
    );
  };
}
