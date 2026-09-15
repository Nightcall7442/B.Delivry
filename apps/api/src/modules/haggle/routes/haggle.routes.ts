/**
 * /api/v1/haggle — discount requests, both sides.
 */
import { answerHaggleSchema, createHaggleSchema, idSchema } from '@bazar/validation';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { HaggleController } from '../controller/haggle.controller.js';

const idParams = z.object({ id: idSchema });
const storeQuery = z.object({ storeId: idSchema });

export function haggleRoutes(controller: HaggleController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.post(
      '/',
      { preHandler: [requireCustomer, validate({ body: createHaggleSchema })] },
      controller.ask,
    );
    app.get('/mine', { preHandler: requireCustomer }, controller.mine);
    app.get('/', { preHandler: validate({ query: storeQuery }) }, controller.forStore);
    app.post(
      '/:id/answer',
      { preHandler: validate({ params: idParams, body: answerHaggleSchema }) },
      controller.answer,
    );
  };
}
