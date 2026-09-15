/**
 * Addresses module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { AddressesService, formatAddress } from './service/addresses.service.js';
export { AddressesRepository } from './repository/addresses.repository.js';
export { AddressesController } from './controller/addresses.controller.js';
export { addressesRoutes } from './routes/addresses.routes.js';
export type { AddressInput, FrozenAddress } from './types/index.js';
