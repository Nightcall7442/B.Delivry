/**
 * Products module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { ProductsService } from './service/products.service.js';
export { ProductsRepository } from './repository/products.repository.js';
export { ProductsController } from './controller/products.controller.js';
export { productsRoutes } from './routes/products.routes.js';
export type { CreateProductInput, ProductListFilters, UpdateProductInput } from './types/index.js';
