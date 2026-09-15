/**
 * Prisma client extension that injects tenantId into queries.
 */
import type { PrismaClient } from '@prisma/client';
import { getContext } from '../common/tenant/tenant-context.js';

/**
 * Models carrying a tenantId column. Keep in sync with schema.prisma; a model
 * missing from this list is simply not auto-scoped, which the repository must
 * then handle itself.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Customer',
  'Courier',
  'Vendor',
  'Store',
  'Product',
  'Order',
  'Delivery',
  'Payment',
  'Address',
  'Cart',
  'Promotion',
  'Coupon',
  'Review',
  'Notification',
  'SupportTicket',
  'WalletTransaction',
  'AuditLog',
  'OtpCode',
]);

/**
 * Defence in depth, not the primary control. Repositories filter by tenant
 * explicitly (see BaseRepository.scoped); this extension catches the query
 * where someone forgot, and turns a cross-tenant read into an empty result
 * rather than another tenant's orders.
 *
 * Writes are left alone on purpose: silently rewriting a create is more
 * surprising than a foreign key error, and creates always name their tenant.
 */
export function withTenantScope(prisma: PrismaClient): PrismaClient {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const context = getContext();
          if (
            context === undefined ||
            model === undefined ||
            !TENANT_SCOPED_MODELS.has(model) ||
            !READ_OPERATIONS.has(operation)
          ) {
            return query(args);
          }

          const typed = args as { where?: Record<string, unknown> };
          return query({
            ...args,
            where: { ...(typed.where ?? {}), tenantId: context.tenantId },
          });
        },
      },
    },
  }) as unknown as PrismaClient;
}

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
