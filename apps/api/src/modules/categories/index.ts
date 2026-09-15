/**
 * Categories module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { CategoriesService, buildTree } from './service/categories.service.js';
export { CategoriesRepository } from './repository/categories.repository.js';
export { CategoriesController } from './controller/categories.controller.js';
export { categoriesRoutes } from './routes/categories.routes.js';
export type { CategoryNode, CreateCategoryInput, UpdateCategoryInput } from './types/index.js';
