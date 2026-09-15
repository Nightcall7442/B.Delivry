/**
 * Admin module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { AdminService } from './service/admin.service.js';
export { AdminRepository } from './repository/admin.repository.js';
export { AdminController } from './controller/admin.controller.js';
export { adminRoutes } from './routes/admin.routes.js';
export type { MonitoringSnapshot, TenantSettings, UpdateSettingsInput } from './types/index.js';
