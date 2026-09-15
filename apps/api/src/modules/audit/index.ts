/**
 * Audit module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { AuditService } from './service/audit.service.js';
export { AuditRepository } from './repository/audit.repository.js';
export { AuditController } from './controller/audit.controller.js';
export { auditRoutes } from './routes/audit.routes.js';
export type { AuditEntry, AuditWriter, AuditListFilters } from './types/index.js';
