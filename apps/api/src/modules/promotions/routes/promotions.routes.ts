/**
 * Promotions route definitions — mounted by src/routes/index.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer, requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { PromotionsController } from '../controller/promotions.controller.js';
import {
  applyCouponSchema,
  couponIdParamsSchema,
  createCouponSchema,
  createPromotionSchema,
  promotionIdParamsSchema,
  promotionListQuerySchema,
  updatePromotionSchema,
} from '../schemas/index.js';

export function promotionsRoutes(controller: PromotionsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Running promotions are shown on the storefront to anyone.
    app.get('/', { preHandler: validate({ query: promotionListQuerySchema }) }, controller.list);

    // Checking a code needs an account: the limit is per customer.
    app.post(
      '/coupons/preview',
      { preHandler: [requireAuth, requireCustomer, validate({ body: applyCouponSchema })] },
      controller.preview,
    );

    const canWrite = [requireAuth, requirePermission(PERMISSION.PROMOTION_WRITE)];

    app.post(
      '/',
      { preHandler: [...canWrite, validate({ body: createPromotionSchema })] },
      controller.create,
    );
    app.patch(
      '/:id',
      {
        preHandler: [
          ...canWrite,
          validate({ params: promotionIdParamsSchema, body: updatePromotionSchema }),
        ],
      },
      controller.update,
    );
    app.get(
      '/:id/coupons',
      { preHandler: [...canWrite, validate({ params: promotionIdParamsSchema })] },
      controller.listCoupons,
    );
    app.post(
      '/coupons',
      { preHandler: [...canWrite, validate({ body: createCouponSchema })] },
      controller.createCoupon,
    );
    app.delete(
      '/coupons/:couponId',
      { preHandler: [...canWrite, validate({ params: couponIdParamsSchema })] },
      controller.deactivateCoupon,
    );
  };
}
