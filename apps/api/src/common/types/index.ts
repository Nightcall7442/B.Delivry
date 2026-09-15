/**
 * Shared backend types: RequestContext, AuthenticatedUser, TenantContext, Id types.
 */
export type { AuthenticatedUser, TokenPair } from '@bazar/auth';
export * from './request-context.js';

export type Id = string;

/** Resolved once per request, before any repository runs. */
export interface TenantContext {
  tenantId: Id;
  slug: string;
  active: boolean;
}

/** Anything a service accepts as "who is asking" plus "which tenant". */
export interface Actor {
  userId: Id | null;
  tenantId: Id;
}
