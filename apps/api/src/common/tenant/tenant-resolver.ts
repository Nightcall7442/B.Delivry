/**
 * Resolves tenant from request (header / subdomain / user).
 */
import type { PrismaClient } from '@prisma/client';
import type { CacheStore } from '../../infrastructure/redis/cache.js';
import { cached } from '../../infrastructure/redis/cache.js';
import type { TenantContext } from '../types/index.js';

export interface TenantLookup {
  bySlug(slug: string): Promise<TenantContext | null>;
  byDomain(domain: string): Promise<TenantContext | null>;
  byId(id: string): Promise<TenantContext | null>;
  /** The single tenant every request falls back to on a single-brand install. */
  default(): Promise<TenantContext>;
}

export interface TenantHints {
  headerSlug?: string | undefined;
  host?: string | undefined;
  /** Tenant baked into the caller's token: authoritative when present. */
  userTenantId?: string | undefined;
}

/**
 * Order matters. The token wins over anything the client can spoof, so a signed
 * -in user cannot reach another tenant by sending a different X-Tenant header.
 * The header and host are only trusted for anonymous traffic.
 */
export async function resolveTenant(
  hints: TenantHints,
  lookup: TenantLookup,
): Promise<TenantContext | null> {
  if (hints.userTenantId !== undefined) {
    return lookup.byId(hints.userTenantId);
  }

  if (hints.headerSlug !== undefined && hints.headerSlug.length > 0) {
    const bySlug = await lookup.bySlug(hints.headerSlug);
    if (bySlug !== null) return bySlug;
  }

  if (hints.host !== undefined && hints.host.length > 0) {
    const domain = hints.host.split(':')[0] ?? hints.host;
    const byDomain = await lookup.byDomain(domain);
    if (byDomain !== null) return byDomain;
  }

  return lookup.default();
}

/**
 * Prisma-backed lookup, cached hard: this runs on every single request and
 * tenants change about once a quarter.
 */
export function prismaTenantLookup(prisma: PrismaClient, cache: CacheStore): TenantLookup {
  const TTL_SECONDS = 600;

  const toContext = (
    row: { id: string; slug: string; active: boolean } | null,
  ): TenantContext | null =>
    row === null ? null : { tenantId: row.id, slug: row.slug, active: row.active };

  const select = { id: true, slug: true, active: true } as const;

  const load = (key: string, query: () => Promise<TenantContext | null>) =>
    cached(cache, key, TTL_SECONDS, query, ['tenants']);

  return {
    bySlug: (slug) =>
      load(`tenant:slug:${slug}`, async () =>
        toContext(await prisma.tenant.findUnique({ where: { slug }, select })),
      ),

    byDomain: (domain) =>
      load(`tenant:domain:${domain}`, async () =>
        toContext(await prisma.tenant.findUnique({ where: { domain }, select })),
      ),

    byId: (id) =>
      load(`tenant:id:${id}`, async () =>
        toContext(await prisma.tenant.findUnique({ where: { id }, select })),
      ),

    async default() {
      const context = await load('tenant:default', async () =>
        toContext(
          await prisma.tenant.findFirst({
            where: { active: true },
            orderBy: { createdAt: 'asc' },
            select,
          }),
        ),
      );

      // A deployment with no tenant row cannot serve anything; failing loudly
      // here beats every request dying somewhere deeper with a null.
      if (context === null) throw new Error('No active tenant configured');
      return context;
    },
  };
}
