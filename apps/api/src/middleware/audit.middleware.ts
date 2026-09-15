/**
 * Audit log hook for mutating admin requests.
 */
import { isStaffRole } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import type { AuditWriter } from '../modules/audit/types/index.js';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Domain events cover what happened to orders and money (see
 * events/handlers/audit.handler.ts). This covers the rest: a staff member
 * editing a tariff, blocking a user or changing settings. Those have no
 * interesting domain event, but they are exactly what gets questioned later.
 *
 * Only successful staff mutations are recorded. Customer traffic would drown
 * the table, and a rejected request changed nothing.
 */
export function registerAuditLog(app: FastifyInstance, audit: AuditWriter): void {
  app.addHook('onResponse', async (request, reply) => {
    const user = request.user;
    if (user === undefined || user === null) return;
    if (!MUTATING.has(request.method)) return;
    if (reply.statusCode >= 400) return;
    if (!user.roles.some(isStaffRole)) return;

    const route = request.routeOptions.url ?? request.url;
    const entity =
      route.split('/').filter((part) => part.length > 0 && !part.startsWith(':'))[2] ?? 'unknown';

    await audit.record({
      tenantId: user.tenantId,
      actorId: user.id,
      actorRole: user.roles[0] ?? null,
      action: `${entity}.${request.method.toLowerCase()}`,
      entity,
      entityId: (request.params as { id?: string } | undefined)?.id ?? null,
      before: null,
      // The request body is the change. Secrets are redacted by the writer.
      after: (request.body as Record<string, unknown> | undefined) ?? null,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      requestId: request.requestId,
    });
  });
}
