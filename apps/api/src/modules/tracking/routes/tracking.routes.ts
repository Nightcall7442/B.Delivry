/**
 * Tracking route definitions — mounted by src/routes/tracking.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCourier } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { TrackingController } from '../controller/tracking.controller.js';
import {
  historyQuerySchema,
  liveMapQuerySchema,
  pushLocationBatchSchema,
  pushLocationSchema,
  trackOrderParamsSchema,
} from '../schemas/index.js';

export function trackingRoutes(controller: TrackingController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    // Location ingest. The websocket channel carries most of this traffic;
    // these endpoints are the fallback for a courier app on a bad connection.
    app.post(
      '/location',
      { preHandler: [requireCourier, validate({ body: pushLocationSchema })] },
      controller.push,
    );
    app.post(
      '/location/batch',
      { preHandler: [requireCourier, validate({ body: pushLocationBatchSchema })] },
      controller.pushBatch,
    );

    // Who may watch an order is decided by the orders service inside trackOrder.
    app.get(
      '/orders/:orderId',
      { preHandler: validate({ params: trackOrderParamsSchema }) },
      controller.trackOrder,
    );

    app.get(
      '/history',
      { preHandler: validate({ query: historyQuerySchema }) },
      controller.history,
    );
    app.get('/live', { preHandler: validate({ query: liveMapQuerySchema }) }, controller.liveMap);
  };
}
