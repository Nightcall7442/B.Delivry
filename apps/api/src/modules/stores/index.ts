/**
 * Stores module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { StoresService } from './service/stores.service.js';
export { StoresRepository } from './repository/stores.repository.js';
export { StoresController } from './controller/stores.controller.js';
export { storesRoutes } from './routes/stores.routes.js';
export type { StoreWithSchedule } from './repository/stores.repository.js';
export type { OpenStore, StoreListFilters, ScheduleEntry } from './types/index.js';
