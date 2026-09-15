/**
 * Pricing module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { PricingService } from './service/pricing.service.js';
export { PricingRepository } from './repository/pricing.repository.js';
export { PricingController } from './controller/pricing.controller.js';
export { pricingRoutes } from './routes/pricing.routes.js';
export { TariffFeeCalculator, courierPayout, surgeFor } from './domain/fee-calculator.js';
export type { Quote, QuoteInput, Tariff, SurgeRule } from './types/index.js';
export type { QuoteRequest } from './service/pricing.service.js';
