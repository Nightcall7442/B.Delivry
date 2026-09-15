/**
 * Pricing route definitions — mounted by src/routes/index.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { PricingController } from '../controller/pricing.controller.js';
import {
  createSurgeRuleSchema,
  createTariffSchema,
  idParamsSchema,
  tariffListQuerySchema,
  updateTariffSchema,
} from '../schemas/index.js';

export function pricingRoutes(controller: PricingController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Quoting an order lives on the orders routes, next to the cart it prices.
    // What is left here is tariff administration, which is staff-only.
    const staffOnly = [requireAuth, requirePermission(PERMISSION.PRICING_WRITE)];

    app.get(
      '/tariffs',
      { preHandler: [...staffOnly, validate({ query: tariffListQuerySchema })] },
      controller.listTariffs,
    );
    app.get(
      '/tariffs/:id',
      { preHandler: [...staffOnly, validate({ params: idParamsSchema })] },
      controller.getTariff,
    );
    app.post(
      '/tariffs',
      { preHandler: [...staffOnly, validate({ body: createTariffSchema })] },
      controller.createTariff,
    );
    app.patch(
      '/tariffs/:id',
      {
        preHandler: [...staffOnly, validate({ params: idParamsSchema, body: updateTariffSchema })],
      },
      controller.updateTariff,
    );

    app.post(
      '/surge-rules',
      { preHandler: [...staffOnly, validate({ body: createSurgeRuleSchema })] },
      controller.createSurgeRule,
    );
    app.delete(
      '/surge-rules/:id',
      { preHandler: [...staffOnly, validate({ params: idParamsSchema })] },
      controller.deleteSurgeRule,
    );
  };
}
