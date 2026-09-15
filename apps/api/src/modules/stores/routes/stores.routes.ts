/**
 * Stores route definitions — mounted by src/routes/stores.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { StoresController } from '../controller/stores.controller.js';
import {
  createStoreSchema,
  setScheduleSchema,
  storeIdParamsSchema,
  storesListQuerySchema,
  updateStoreSchema,
} from '../schemas/index.js';

const arrivalsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(100),
  announce: z.boolean().default(false),
  photoUrl: z.string().url().max(500).optional(),
});

export function storesRoutes(controller: StoresController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Browsing the marketplace needs no account: a customer picks a bazaar
    // before they sign in.
    app.get('/', { preHandler: validate({ query: storesListQuerySchema }) }, controller.list);
    app.get('/:id', { preHandler: validate({ params: storeIdParamsSchema }) }, controller.get);
    app.post(
      '/:id/arrivals',
      {
        preHandler: [requireAuth, validate({ params: storeIdParamsSchema, body: arrivalsSchema })],
      },
      controller.markArrivals,
    );

    const canWrite = [requireAuth, requirePermission(PERMISSION.STORE_WRITE)];

    app.post(
      '/',
      { preHandler: [...canWrite, validate({ body: createStoreSchema })] },
      controller.create,
    );
    app.patch(
      '/:id',
      {
        preHandler: [
          ...canWrite,
          validate({ params: storeIdParamsSchema, body: updateStoreSchema }),
        ],
      },
      controller.update,
    );
    app.put(
      '/:id/schedule',
      {
        preHandler: [
          ...canWrite,
          validate({ params: storeIdParamsSchema, body: setScheduleSchema }),
        ],
      },
      controller.setSchedule,
    );
    app.delete(
      '/:id',
      { preHandler: [...canWrite, validate({ params: storeIdParamsSchema })] },
      controller.remove,
    );
  };
}
