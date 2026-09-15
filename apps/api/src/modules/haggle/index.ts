/**
 * Haggle module public API. Other modules import ONLY from here.
 */
export { HaggleService, type HaggleRow } from './service/haggle.service.js';
export { HaggleController } from './controller/haggle.controller.js';
export { haggleRoutes } from './routes/haggle.routes.js';
