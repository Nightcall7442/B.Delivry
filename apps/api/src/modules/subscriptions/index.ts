/**
 * Subscriptions module public API. Other modules import ONLY from here.
 */
export {
  SubscriptionsService,
  type SubscriptionWithNames,
} from './service/subscriptions.service.js';
export { SubscriptionsRepository } from './repository/subscriptions.repository.js';
export { SubscriptionsController } from './controller/subscriptions.controller.js';
export { subscriptionsRoutes } from './routes/subscriptions.routes.js';
