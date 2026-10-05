/**
 * Favorites module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { FavoritesService } from './service/favorites.service.js';
export { FavoritesRepository } from './repository/favorites.repository.js';
export { FavoritesController } from './controller/favorites.controller.js';
export { favoritesRoutes } from './routes/favorites.routes.js';
export type { FavoriteIds, FavoriteKind } from './types/index.js';
