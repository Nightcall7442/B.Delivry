/**
 * Per-request context: requestId, user, tenant, locale, ip.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import type { Locale } from '@bazar/constants';

/**
 * Assembled by middleware and passed down into services, so nothing below the
 * HTTP layer needs a Fastify request object. That is what lets a service be
 * called from a job or a websocket handler with a synthetic context.
 */
export interface RequestContext {
  requestId: string;
  tenantId: string;
  locale: Locale;
  /** null on public endpoints. */
  user: AuthenticatedUser | null;
  /** Set by systemContext(): a job acting as the platform, which no permission check applies to. */
  system?: true;
  ip: string | null;
  userAgent: string | null;
  startedAt: Date;
}

/** Context for background work: a job acts as the system, inside one tenant. */
export function systemContext(tenantId: string, requestId: string, locale: Locale): RequestContext {
  return {
    requestId,
    tenantId,
    locale,
    user: null,
    system: true,
    ip: null,
    userAgent: null,
    startedAt: new Date(),
  };
}

/** Narrowing helper for the many services that require a signed-in user. */
export function requireUser(context: RequestContext): AuthenticatedUser {
  if (context.user === null) {
    throw new Error('RequestContext has no user; route must be authenticated');
  }
  return context.user;
}
