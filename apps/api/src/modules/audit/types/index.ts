/**
 * Audit module-internal types & DTOs.
 */

export interface AuditEntry {
  tenantId: string;
  actorId: string | null;
  actorRole?: string | null;
  /** entity.action, e.g. order.cancel, tariff.update. */
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * The write side, kept separate from the full service so middleware and event
 * handlers can depend on "I can record" without pulling in querying, paging
 * and permissions.
 */
export interface AuditWriter {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditListFilters {
  actorId?: string | undefined;
  entity?: string | undefined;
  entityId?: string | undefined;
  action?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
