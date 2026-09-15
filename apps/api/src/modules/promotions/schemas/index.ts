/**
 * Promotions request/response Zod schemas (reuse @bazar/validation where shared).
 */
export {
  applyCouponSchema,
  createCouponSchema,
  createPromotionSchema,
  updatePromotionSchema,
} from '@bazar/validation';

import { idSchema, listQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const promotionListQuerySchema = listQuerySchema.extend({
  activeOnly: z.coerce.boolean().optional(),
});

export const promotionIdParamsSchema = z.object({ id: idSchema });
export const couponIdParamsSchema = z.object({ couponId: idSchema });

export type PromotionListQuery = z.infer<typeof promotionListQuerySchema>;
