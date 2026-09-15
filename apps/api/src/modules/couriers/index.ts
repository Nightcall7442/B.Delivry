/**
 * Couriers module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { CouriersService } from './service/couriers.service.js';
export { CouriersRepository } from './repository/couriers.repository.js';
export { CouriersController } from './controller/couriers.controller.js';
export { couriersRoutes } from './routes/couriers.routes.js';
export type { CourierWithUser } from './repository/couriers.repository.js';
export type { CourierListFilters, CourierShift, RegisterCourierInput } from './types/index.js';
