/**
 * Delivery route definitions — mounted by src/routes/delivery.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCourier, requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { DeliveryController } from '../controller/delivery.controller.js';
import {
  acceptDeliverySchema,
  completeDeliverySchema,
  deliveryIdParamsSchema,
  deliveryListQuerySchema,
  failDeliverySchema,
  assignDeliverySchema,
  releaseDeliverySchema,
} from '../schemas/index.js';

export function deliveryRoutes(controller: DeliveryController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.get('/', { preHandler: validate({ query: deliveryListQuerySchema }) }, controller.list);

    // Everything below is the courier app driving a trip forward.
    app.get('/active', { preHandler: requireCourier }, controller.active);
    app.get('/:id', { preHandler: validate({ params: deliveryIdParamsSchema }) }, controller.get);

    const courierAction = (bodySchema?: Parameters<typeof validate>[0]['body']) => [
      requireCourier,
      validate({
        params: deliveryIdParamsSchema,
        ...(bodySchema !== undefined ? { body: bodySchema } : {}),
      }),
    ];

    app.post('/:id/accept', { preHandler: courierAction(acceptDeliverySchema) }, controller.accept);
    app.post('/:id/decline', { preHandler: courierAction() }, controller.decline);
    app.post('/:id/arrived-pickup', { preHandler: courierAction() }, controller.arrivedAtPickup);
    app.post('/:id/picked-up', { preHandler: courierAction() }, controller.pickedUp);
    app.post('/:id/arrived-dropoff', { preHandler: courierAction() }, controller.arrivedAtDropoff);
    app.post(
      '/:id/complete',
      { preHandler: courierAction(completeDeliverySchema) },
      controller.complete,
    );
    app.post('/:id/fail', { preHandler: courierAction(failDeliverySchema) }, controller.fail);

    // Operator overrides, not courier actions.
    const operator = (bodySchema?: Parameters<typeof validate>[0]['body']) => [
      requirePermission(PERMISSION.ORDER_ASSIGN),
      validate({
        params: deliveryIdParamsSchema,
        ...(bodySchema !== undefined ? { body: bodySchema } : {}),
      }),
    ];
    app.post('/:id/assign', { preHandler: operator(assignDeliverySchema) }, controller.assign);
    app.post('/:id/search', { preHandler: operator() }, controller.restartSearch);
    app.post(
      '/:id/release',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_ASSIGN),
          validate({ params: deliveryIdParamsSchema, body: releaseDeliverySchema }),
        ],
      },
      controller.release,
    );
  };
}
