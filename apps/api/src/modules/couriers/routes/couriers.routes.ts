/**
 * Couriers route definitions — mounted by src/routes/couriers.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { idSchema } from '@bazar/validation';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import {
  requireCourier,
  requireCustomer,
  requirePermission,
} from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { CouriersController } from '../controller/couriers.controller.js';
import {
  courierIdParamsSchema,
  couriersListQuerySchema,
  registerCourierSchema,
  setCourierStatusSchema,
  updateCourierSchema,
} from '../schemas/index.js';

export function couriersRoutes(controller: CouriersController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    // A customer volunteering as a mahalla courier.
    app.post(
      '/apply',
      { preHandler: [requireCustomer, validate({ body: z.object({ addressId: idSchema }) })] },
      controller.applyNeighbour,
    );

    // The courier app's own endpoints.
    app.get('/me', { preHandler: requireCourier }, controller.me);
    app.get('/me/shift', { preHandler: requireCourier }, controller.shift);
    app.get('/me/balance', { preHandler: requireCourier }, controller.balance);
    app.put(
      '/me/status',
      { preHandler: [requireCourier, validate({ body: setCourierStatusSchema })] },
      controller.setStatus,
    );

    const canRead = requirePermission(PERMISSION.COURIER_READ);
    const canWrite = requirePermission(PERMISSION.COURIER_WRITE);

    app.get(
      '/',
      { preHandler: [canRead, validate({ query: couriersListQuerySchema })] },
      controller.list,
    );
    app.get(
      '/:id',
      { preHandler: [canRead, validate({ params: courierIdParamsSchema })] },
      controller.get,
    );

    app.post(
      '/',
      { preHandler: [canWrite, validate({ body: registerCourierSchema })] },
      controller.register,
    );
    app.patch(
      '/:id',
      { preHandler: validate({ params: courierIdParamsSchema, body: updateCourierSchema }) },
      controller.update,
    );
    app.post(
      '/:id/verify',
      { preHandler: [canWrite, validate({ params: courierIdParamsSchema })] },
      controller.verify,
    );
    app.post(
      '/:id/suspend',
      { preHandler: [canWrite, validate({ params: courierIdParamsSchema })] },
      controller.suspend,
    );
  };
}
