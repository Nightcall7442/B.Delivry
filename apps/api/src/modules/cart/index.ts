/**
 * Cart module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { CartService } from './service/cart.service.js';
export { CartRepository } from './repository/cart.repository.js';
export { CartController } from './controller/cart.controller.js';
export { cartRoutes } from './routes/cart.routes.js';
export type { CartWithItems } from './repository/cart.repository.js';
export type { AddItemInput, CartLine, CartView } from './types/index.js';
