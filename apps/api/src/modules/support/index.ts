/**
 * Support module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { SupportService } from './service/support.service.js';
export { SupportRepository } from './repository/support.repository.js';
export { SupportController } from './controller/support.controller.js';
export { supportRoutes } from './routes/support.routes.js';
export type { TicketWithMessages } from './repository/support.repository.js';
export type { CreateTicketInput, TicketListFilters, TicketStatus } from './types/index.js';
