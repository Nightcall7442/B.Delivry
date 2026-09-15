/**
 * Vendors module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { VendorsService } from './service/vendors.service.js';
export { VendorsRepository } from './repository/vendors.repository.js';
export { VendorsController } from './controller/vendors.controller.js';
export { vendorsRoutes } from './routes/vendors.routes.js';
export type { VendorWithCounts } from './repository/vendors.repository.js';
export type { CreateVendorInput, PayoutSummary, VendorListFilters } from './types/index.js';
