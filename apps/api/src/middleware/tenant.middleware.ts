/**
 * Resolve tenant → tenant context.
 */
import type { FastifyInstance } from 'fastify';
import { DEFAULT_LOCALE } from '@bazar/constants';
import { resolveTenant, type TenantLookup } from '../common/tenant/tenant-resolver.js';
import { runWithContext } from '../common/tenant/tenant-context.js';
import { TenantNotResolvedError } from '../common/errors/index.js';
import { ERROR_CODE } from '../common/errors/error-codes.js';
import { AppError } from '../common/errors/app.error.js';
import type { RequestContext } from '../common/types/request-context.js';

export const TENANT_HEADER = 'x-tenant';

/**
 * Runs before everything that touches data. The whole rest of the request
 * executes inside runWithContext, which is what makes the tenant available to
 * repositories without threading it through every call.
 *
 * Auth has already run at this point when a token was sent, so a signed-in
 * user's own tenant wins over any header they could forge.
 */
export function registerTenantResolution(app: FastifyInstance, lookup: TenantLookup): void {
  app.addHook('preHandler', (request, _reply, done) => {
    const header = request.headers[TENANT_HEADER];
    const headerSlug = Array.isArray(header) ? header[0] : header;

    void resolveTenant(
      {
        headerSlug,
        host: request.headers.host,
        userTenantId: request.user?.tenantId,
      },
      lookup,
    )
      .then((tenant) => {
        if (tenant === null) throw new TenantNotResolvedError();
        if (!tenant.active) {
          throw new AppError(ERROR_CODE.TENANT_INACTIVE, 403, 'Tenant is not active');
        }

        const context: RequestContext = {
          requestId: request.requestId,
          tenantId: tenant.tenantId,
          locale: request.locale ?? DEFAULT_LOCALE,
          user: request.user ?? null,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          startedAt: new Date(),
        };

        request.ctx = context;
        request.tenant = tenant;

        // done() is called inside the storage scope, so every handler, service
        // and repository downstream sees this context.
        runWithContext(context, done);
      })
      .catch(done);
  });
}
