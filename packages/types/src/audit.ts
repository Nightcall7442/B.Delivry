/**
 * audit types / DTOs.
 */
import type { Id, TenantEntity } from './common.js';

/**
 * Append-only. Rows are never updated or deleted: that is the whole point of
 * having them when a refund or a price change is disputed later.
 */
export interface AuditLogDto extends TenantEntity {
  /** null for system actions (jobs, webhooks). */
  actorId: Id | null;
  actorRole: string | null;
  /** Verb in the form entity.action, e.g. order.cancel, tariff.update. */
  action: string;
  entity: string;
  entityId: Id | null;
  /** Only the fields that changed, secrets already stripped. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditLogQuery {
  actorId?: Id;
  entity?: string;
  entityId?: Id;
  action?: string;
  from?: string;
  to?: string;
}
