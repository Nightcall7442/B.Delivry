/**
 * Customers module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { CustomersService } from './service/customers.service.js';
export { CustomersRepository } from './repository/customers.repository.js';
export { CustomersController } from './controller/customers.controller.js';
export { customersRoutes } from './routes/customers.routes.js';
export type { CustomerWithUser } from './repository/customers.repository.js';
export type { CustomerListFilters, UpdateCustomerInput } from './types/index.js';
