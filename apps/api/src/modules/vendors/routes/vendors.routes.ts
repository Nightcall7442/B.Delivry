/**
 * Vendors route definitions — mounted by src/routes/vendors.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission, requireVendor } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { VendorsController } from '../controller/vendors.controller.js';
import {
  payoutQuerySchema,
  registerVendorSchema,
  setCommissionSchema,
  setVendorStatusSchema,
  updateVendorSchema,
  vendorIdParamsSchema,
  vendorsListQuerySchema,
} from '../schemas/index.js';

export function vendorsRoutes(controller: VendorsController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    app.get('/me', { preHandler: requireVendor }, controller.me);
    app.get(
      '/me/payout',
      { preHandler: [requireVendor, validate({ query: payoutQuerySchema })] },
      controller.myPayout,
    );

    const canRead = requirePermission(PERMISSION.VENDOR_READ);
    const canWrite = requirePermission(PERMISSION.VENDOR_WRITE);

    app.get(
      '/',
      { preHandler: [canRead, validate({ query: vendorsListQuerySchema })] },
      controller.list,
    );
    app.get('/:id', { preHandler: validate({ params: vendorIdParamsSchema }) }, controller.get);

    // Anyone signed in may apply to become a vendor; approval is a staff act.
    app.post('/', { preHandler: validate({ body: registerVendorSchema }) }, controller.register);

    app.patch(
      '/:id',
      { preHandler: validate({ params: vendorIdParamsSchema, body: updateVendorSchema }) },
      controller.update,
    );
    app.put(
      '/:id/status',
      {
        preHandler: [
          canWrite,
          validate({ params: vendorIdParamsSchema, body: setVendorStatusSchema }),
        ],
      },
      controller.setStatus,
    );
    app.put(
      '/:id/commission',
      {
        preHandler: [
          requirePermission(PERMISSION.PRICING_WRITE),
          validate({ params: vendorIdParamsSchema, body: setCommissionSchema }),
        ],
      },
      controller.setCommission,
    );
    app.get(
      '/:id/payout',
      { preHandler: validate({ params: vendorIdParamsSchema, query: payoutQuerySchema }) },
      controller.payout,
    );
  };
}
