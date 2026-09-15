/**
 * AsyncLocalStorage-based tenant context; repositories read tenantId from here.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantNotResolvedError } from '../errors/index.js';
import type { RequestContext } from '../types/request-context.js';

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Ambient request context. Repositories read the tenant from here instead of
 * taking it as a parameter on every method: one forgotten argument in a
 * multi-tenant query is a data leak, and this makes forgetting impossible.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export const getContext = (): RequestContext | undefined => storage.getStore();

export function requireContext(): RequestContext {
  const context = storage.getStore();
  if (context === undefined) throw new TenantNotResolvedError();
  return context;
}

export function currentTenantId(): string {
  return requireContext().tenantId;
}

export const currentUserId = (): string | null => getContext()?.user?.id ?? null;

export const currentRequestId = (): string | undefined => getContext()?.requestId;
