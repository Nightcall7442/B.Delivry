/**
 * Payments route definitions — mounted by src/routes/payments.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { PaymentsController } from '../controller/payments.controller.js';
import {
  createPaymentSchema,
  paymentIdParamsSchema,
  paymentsListQuerySchema,
  refundPaymentSchema,
  walletHistoryQuerySchema,
} from '../schemas/index.js';

export function paymentsRoutes(controller: PaymentsController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.post('/', { preHandler: validate({ body: createPaymentSchema }) }, controller.create);
    app.get('/', { preHandler: validate({ query: paymentsListQuerySchema }) }, controller.list);
    app.get('/:id', { preHandler: validate({ params: paymentIdParamsSchema }) }, controller.get);

    // Refunds move real money back, so they need the explicit permission
    // rather than merely being staff.
    app.post(
      '/:id/refund',
      {
        preHandler: [
          requirePermission(PERMISSION.PAYMENT_REFUND),
          validate({ params: paymentIdParamsSchema, body: refundPaymentSchema }),
        ],
      },
      controller.refund,
    );

    app.get('/wallet/balance', controller.balance);
    app.get(
      '/wallet/history',
      { preHandler: validate({ query: walletHistoryQuerySchema }) },
      controller.walletHistory,
    );
  };
}
