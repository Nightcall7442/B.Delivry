/**
 * Analytics module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { AnalyticsService } from './service/analytics.service.js';
export { AnalyticsRepository } from './repository/analytics.repository.js';
export { AnalyticsController } from './controller/analytics.controller.js';
export { analyticsRoutes } from './routes/analytics.routes.js';
export type { AnalyticsQuery, DashboardStats, SalesReport } from './types/index.js';
