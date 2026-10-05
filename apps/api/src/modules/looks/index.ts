/**
 * Looks («Покажите товар») module public API. Other modules import ONLY from here.
 */
export { LooksService, type LookRow } from './service/looks.service.js';
export { LooksController } from './controller/looks.controller.js';
export { looksRoutes } from './routes/looks.routes.js';
