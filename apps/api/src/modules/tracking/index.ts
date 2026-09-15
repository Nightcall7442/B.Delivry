/**
 * Tracking module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { TrackingService, thinOut } from './service/tracking.service.js';
export { TrackingRepository } from './repository/tracking.repository.js';
export { TrackingController } from './controller/tracking.controller.js';
export { trackingRoutes } from './routes/tracking.routes.js';
export { RouteEtaCalculator, estimateFromDistance } from './domain/eta.calculator.js';
export type { EtaCalculator, EtaResult } from './domain/eta.calculator.js';
export type { LocationPing, TrackingView, HistoryFilters } from './types/index.js';
