/**
 * Middleware barrel.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import type { Locale } from '@bazar/constants';
import type { RequestContext, TenantContext } from '../common/types/index.js';

/**
 * What the middleware chain hangs on every request. Declared once here so
 * handlers get these typed without casting.
 */
declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    locale: Locale;
    user: AuthenticatedUser | null;
    tenant: TenantContext | null;
    ctx: RequestContext | null;
  }
}

export * from './audit.middleware.js';
export * from './auth.middleware.js';
export * from './error-handler.middleware.js';
export * from './locale.middleware.js';
export * from './not-found.middleware.js';
export * from './rate-limit.middleware.js';
export * from './rbac.middleware.js';
export * from './request-id.middleware.js';
export * from './request-logger.middleware.js';
export * from './sanitize.middleware.js';
export * from './security-headers.middleware.js';
export * from './tenant.middleware.js';
export * from './validation.middleware.js';
