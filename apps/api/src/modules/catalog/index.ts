/**
 * Catalog module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { CatalogService } from './service/catalog.service.js';
export { CatalogRepository } from './repository/catalog.repository.js';
export { CatalogController } from './controller/catalog.controller.js';
export { catalogRoutes } from './routes/catalog.routes.js';
export type { ProductWithImages } from './repository/catalog.repository.js';
export type { PurchasableProduct, CatalogSearchFilters } from './types/index.js';
