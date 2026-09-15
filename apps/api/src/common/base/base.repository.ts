/**
 * Abstract repository base: prisma access, tenant scoping, soft-delete helpers.
 */
import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors/index.js';
import { currentTenantId } from '../tenant/tenant-context.js';
import {
  normalizeOffset,
  paginate,
  toPrismaPage,
  type OffsetInput,
  type PaginatedResult,
} from '../pagination/index.js';

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Concrete repositories write their own Prisma queries: the generated types are
 * worth keeping, and a generic CRUD wrapper would erase them. What lives here
 * is only the part every repository must not get wrong.
 */
export abstract class BaseRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  /** Runs inside an open transaction when one was handed down, else standalone. */
  protected client(tx?: PrismaTransaction): PrismaTransaction {
    return tx ?? this.prisma;
  }

  /**
   * Tenant filter for every query on a tenant-scoped model. Reads the ambient
   * request context rather than taking an argument, because a forgotten
   * argument here means one tenant reading another one's orders.
   */
  protected tenantScope(): { tenantId: string } {
    return { tenantId: currentTenantId() };
  }

  /** Soft-deleted rows are invisible unless a call site asks for them. */
  protected readonly alive = { deletedAt: null };

  protected scoped<T extends Record<string, unknown>>(where: T): T & { tenantId: string } {
    return { ...where, ...this.tenantScope() };
  }

  protected scopedAlive<T extends Record<string, unknown>>(
    where: T,
  ): T & { tenantId: string; deletedAt: null } {
    return { ...where, ...this.tenantScope(), ...this.alive };
  }

  /** Throws the 404 instead of returning null, for the common "must exist" path. */
  protected found<T>(row: T | null, entity: string, id?: string): T {
    if (row === null) throw new NotFoundError(entity, id);
    return row;
  }

  /**
   * Runs the list query and its count in one round trip. Every admin table goes
   * through this, so they all page identically.
   */
  protected async page<T>(
    params: OffsetInput,
    query: (page: { skip: number; take: number }) => Promise<T[]>,
    count: () => Promise<number>,
  ): Promise<PaginatedResult<T>> {
    const normalized = normalizeOffset(params);
    const [items, total] = await Promise.all([query(toPrismaPage(normalized)), count()]);
    return paginate(items, total, normalized);
  }
}
