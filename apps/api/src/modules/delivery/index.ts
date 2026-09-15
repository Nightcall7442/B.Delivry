/**
 * Delivery module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { DeliveryService } from './service/delivery.service.js';
export { DeliveryRepository } from './repository/delivery.repository.js';
export { DeliveryController } from './controller/delivery.controller.js';
export { deliveryRoutes } from './routes/delivery.routes.js';
export {
  BroadcastStrategy,
  NearestCourierStrategy,
  RatingWeightedStrategy,
} from './domain/courier-matching.strategy.js';
export type { CourierMatchingStrategy } from './domain/courier-matching.strategy.js';
export { DELIVERY_EVENT } from './domain/delivery.events.js';
export type { DeliveryEventPayloads } from './domain/delivery.events.js';
export type { CourierCandidate, ScoredCandidate, DeliveryListFilters } from './types/index.js';
