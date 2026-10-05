/**
 * /api/v1/regulars — «Свой продавец»: the stall's memory of a customer, through an order it holds,
 * and the customer's own standing at a stall.
 */
import { idSchema, regularNoteSchema } from '@bazar/validation';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { RegularsController } from '../controller/regulars.controller.js';

const orderParams = z.object({ orderId: idSchema });
const storeParams = z.object({ storeId: idSchema });

export function regularsRoutes(controller: RegularsController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.get(
      '/orders/:orderId',
      { preHandler: validate({ params: orderParams }) },
      controller.forOrder,
    );
    app.put(
      '/orders/:orderId/note',
      { preHandler: validate({ params: orderParams, body: regularNoteSchema }) },
      controller.setNote,
    );
    app.get(
      '/stores/:storeId/me',
      { preHandler: [requireCustomer, validate({ params: storeParams })] },
      controller.mine,
    );
  };
}
