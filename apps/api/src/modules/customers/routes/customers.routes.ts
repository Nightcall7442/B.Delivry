/**
 * Customers route definitions — mounted by src/routes/customers.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer, requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { CustomersController } from '../controller/customers.controller.js';
import {
  applyBusinessSchema,
  creditSchema,
  customerIdParamsSchema,
  customersListQuerySchema,
  setBusinessSchema,
  updateCustomerSchema,
} from '../schemas/index.js';

const applyReferralSchema = z.object({ code: z.string().trim().min(4).max(12) });

export function customersRoutes(controller: CustomersController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.get('/me', { preHandler: requireCustomer }, controller.me);
    app.get('/me/referral', { preHandler: requireCustomer }, controller.referral);
    app.post(
      '/me/referral',
      { preHandler: [requireCustomer, validate({ body: applyReferralSchema })] },
      controller.applyReferral,
    );
    app.patch(
      '/me',
      { preHandler: [requireCustomer, validate({ body: updateCustomerSchema })] },
      controller.updateMe,
    );
    app.post(
      '/me/business',
      { preHandler: [requireCustomer, validate({ body: applyBusinessSchema })] },
      controller.applyBusiness,
    );

    const canRead = requirePermission(PERMISSION.CUSTOMER_READ);
    const canWrite = requirePermission(PERMISSION.USER_WRITE);

    app.get(
      '/',
      { preHandler: [canRead, validate({ query: customersListQuerySchema })] },
      controller.list,
    );
    app.get('/:id', { preHandler: validate({ params: customerIdParamsSchema }) }, controller.get);

    app.post(
      '/:id/block',
      { preHandler: [canWrite, validate({ params: customerIdParamsSchema })] },
      controller.block,
    );
    app.patch(
      '/:id/business',
      {
        preHandler: [
          canWrite,
          validate({ params: customerIdParamsSchema, body: setBusinessSchema }),
        ],
      },
      controller.setBusiness,
    );
    app.post(
      '/:id/unblock',
      { preHandler: [canWrite, validate({ params: customerIdParamsSchema })] },
      controller.unblock,
    );
    // Store credit moves money, so it needs the refund permission.
    app.post(
      '/:id/credit',
      {
        preHandler: [
          requirePermission(PERMISSION.PAYMENT_REFUND),
          validate({ params: customerIdParamsSchema, body: creditSchema }),
        ],
      },
      controller.credit,
    );
  };
}
