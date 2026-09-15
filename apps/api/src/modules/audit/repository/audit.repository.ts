/**
 * Audit persistence (Prisma). Tenant-scoped.
 */
import type { AuditLog, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { AuditEntry, AuditListFilters } from '../types/index.js';

export class AuditRepository extends BaseRepository {
  /**
   * Insert only. There is deliberately no update or delete here: an audit row
   * that can be edited is not evidence of anything.
   */
  async create(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        // Spread rather than `?? undefined`: an explicitly undefined Json
        // column is a different thing to Prisma than an absent one.
        ...(entry.before !== null ? { before: entry.before as Prisma.InputJsonValue } : {}),
        ...(entry.after !== null ? { after: entry.after as Prisma.InputJsonValue } : {}),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }

  async list(filters: AuditListFilters): Promise<PaginatedResult<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      ...this.tenantScope(),
      ...(filters.actorId !== undefined ? { actorId: filters.actorId } : {}),
      ...(filters.entity !== undefined ? { entity: filters.entity } : {}),
      ...(filters.entityId !== undefined ? { entityId: filters.entityId } : {}),
      ...(filters.action !== undefined ? { action: filters.action } : {}),
      ...(filters.from !== undefined || filters.to !== undefined
        ? {
            createdAt: {
              ...(filters.from !== undefined ? { gte: filters.from } : {}),
              ...(filters.to !== undefined ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    return this.page(
      filters,
      (page) => this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => this.prisma.auditLog.count({ where }),
    );
  }

  /** Everything that ever happened to one record, oldest first. */
  async trail(entity: string, entityId: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { ...this.tenantScope(), entity, entityId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
  }
}
