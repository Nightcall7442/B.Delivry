/**
 * Promotions module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { PromotionsService } from './service/promotions.service.js';
export { PromotionsRepository } from './repository/promotions.repository.js';
export { PromotionsController } from './controller/promotions.controller.js';
export { promotionsRoutes } from './routes/promotions.routes.js';
export type { AppliedCoupon, CouponPreview, PromotionInput } from './types/index.js';
