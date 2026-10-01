/**
 * Audit business logic. Immutable trail of who changed what.
 */
import { PERMISSION } from '@bazar/constants';
import type { AuditLog } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { AuditRepository } from '../repository/audit.repository.js';
import type { AuditEntry, AuditListFilters, AuditWriter } from '../types/index.js';

/** Never store these, whatever the caller passed in. */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'code',
  'codeHash',
  'token',
  'accessToken',
  'refreshToken',
  'secretKey',
  'apiKey',
  'secret',
  'otp',
  'pin',
  'cvv',
  'cardNumber',
  'authorization',
]);

/** Past this depth a value is dropped rather than walked: a body is not trusted to be shallow. */
const MAX_REDACT_DEPTH = 8;

/**
 * Secrets are named by key wherever they sit: a body that nests them (`{ credentials: { password } }`,
 * a list of `{ token }`) is stored as readable in the trail as a flat one would be.
 */
function redactValue(value: unknown, depth: number): unknown {
  if (typeof value !== 'object' || value === null || value instanceof Date) return value;
  if (depth >= MAX_REDACT_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : redactValue(item, depth + 1);
  }
  return out;
}

function redact(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (value === null) return null;
  return redactValue(value, 0) as Record<string, unknown>;
}

export class AuditService extends BaseService implements AuditWriter {
  constructor(
    deps: ServiceDeps,
    private readonly repository: AuditRepository,
  ) {
    super(deps);
  }

  /**
   * Writing must never break the thing being audited. A failure here is logged
   * loudly and swallowed: losing one audit row is bad, failing a delivered
   * order because the audit insert timed out is worse.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repository.create({
        ...entry,
        before: redact(entry.before),
        after: redact(entry.after),
      });
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'failed to write audit log');
    }
  }

  async list(filters: AuditListFilters): Promise<PaginatedResult<AuditLog>> {
    this.authorize(PERMISSION.AUDIT_READ);
    return this.repository.list(filters);
  }

  /** Full history of one record, for a support agent settling a dispute. */
  async trail(entity: string, entityId: string): Promise<AuditLog[]> {
    this.authorize(PERMISSION.AUDIT_READ);
    return this.repository.trail(entity, entityId);
  }
}
