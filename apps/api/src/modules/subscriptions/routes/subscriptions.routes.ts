/**
 * /api/v1/subscriptions — the caller's own cart subscriptions.
 */
import { createSubscriptionSchema, idSchema, updateSubscriptionSchema } from '@bazar/validation';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { SubscriptionsController } from '../controller/subscriptions.controller.js';

const idParams = z.object({ id: idSchema });

export function subscriptionsRoutes(controller: SubscriptionsController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requireCustomer);

    app.get('/', controller.list);
    app.post('/', { preHandler: validate({ body: createSubscriptionSchema }) }, controller.create);
    app.patch(
      '/:id',
      { preHandler: validate({ params: idParams, body: updateSubscriptionSchema }) },
      controller.update,
    );
    app.delete('/:id', { preHandler: validate({ params: idParams }) }, controller.remove);
  };
}
