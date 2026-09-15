/**
 * Orders route definitions — mounted by src/routes/orders.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCourier, requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { OrdersController } from '../controller/orders.controller.js';
import {
  actualQuantitiesSchema,
  cancelOrderSchema,
  changeOrderStatusSchema,
  courierActionSchema,
  createGroupOrderSchema,
  createOrderSchema,
  orderIdParamsSchema,
  orderNumberParamsSchema,
  ordersListQuerySchema,
  quoteGroupOrderSchema,
  quoteOrderSchema,
  repeatOrderSchema,
} from '../schemas/index.js';

const chatMessageSchema = z.object({ text: z.string().trim().min(1).max(500) });

export function ordersRoutes(controller: OrdersController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Nothing here is public. Who may see which order is decided per record in
    // the service, because it depends on whether the caller is the customer,
    // the assigned courier or an operator.
    app.addHook('preHandler', requireAuth);

    app.post(
      '/',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_CREATE),
          validate({ body: createOrderSchema }),
        ],
      },
      controller.create,
    );

    app.post(
      '/group',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_CREATE),
          validate({ body: createGroupOrderSchema }),
        ],
      },
      controller.createGroup,
    );
    app.post(
      '/group/quote',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_CREATE),
          validate({ body: quoteGroupOrderSchema }),
        ],
      },
      controller.quoteGroup,
    );

    app.post(
      '/quote',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_CREATE),
          validate({ body: quoteOrderSchema }),
        ],
      },
      controller.quote,
    );

    app.get('/', { preHandler: validate({ query: ordersListQuerySchema }) }, controller.list);

    app.get(
      '/by-number/:number',
      { preHandler: validate({ params: orderNumberParamsSchema }) },
      controller.getByNumber,
    );

    app.get('/:id', { preHandler: validate({ params: orderIdParamsSchema }) }, controller.get);
    app.get(
      '/:id/messages',
      { preHandler: validate({ params: orderIdParamsSchema }) },
      controller.listMessages,
    );
    app.post(
      '/:id/messages',
      { preHandler: validate({ params: orderIdParamsSchema, body: chatMessageSchema }) },
      controller.postMessage,
    );

    app.post(
      '/:id/cancel',
      { preHandler: validate({ params: orderIdParamsSchema, body: cancelOrderSchema }) },
      controller.cancel,
    );

    app.post(
      '/:id/repeat',
      { preHandler: validate({ params: orderIdParamsSchema, body: repeatOrderSchema }) },
      controller.repeat,
    );

    // Courier-driven progress: the app sends a verb, the service maps it to a
    // status and the state machine decides whether it is legal from here.
    app.post(
      '/:id/courier-action',
      {
        preHandler: [
          requireCourier,
          validate({ params: orderIdParamsSchema, body: courierActionSchema }),
        ],
      },
      controller.courierAction,
    );

    app.post(
      '/:id/actual-quantities',
      {
        preHandler: [
          requireCourier,
          validate({ params: orderIdParamsSchema, body: actualQuantitiesSchema }),
        ],
      },
      controller.reprice,
    );

    // Operator controls.
    app.post(
      '/:id/invoice-paid',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_UPDATE),
          validate({ params: orderIdParamsSchema }),
        ],
      },
      controller.invoicePaid,
    );
    app.post(
      '/:id/confirm',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_UPDATE),
          validate({ params: orderIdParamsSchema }),
        ],
      },
      controller.confirm,
    );

    app.patch(
      '/:id/status',
      {
        preHandler: [
          requirePermission(PERMISSION.ORDER_UPDATE),
          validate({ params: orderIdParamsSchema, body: changeOrderStatusSchema }),
        ],
      },
      controller.changeStatus,
    );
  };
}
