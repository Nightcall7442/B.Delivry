/**
 * Health/readiness checks (db, redis, queue).
 */
import type { PrismaClient } from '@prisma/client';
import type { RedisClient } from '../redis/redis.client.js';

export type HealthState = 'up' | 'down';

export interface HealthReport {
  status: HealthState;
  uptimeSeconds: number;
  version: string;
  checks: Record<string, { status: HealthState; latencyMs?: number; error?: string }>;
}

export interface HealthDeps {
  prisma: PrismaClient;
  redis: RedisClient;
  version: string;
}

async function timed(
  fn: () => Promise<unknown>,
): Promise<{ status: HealthState; latencyMs?: number; error?: string }> {
  const started = Date.now();
  try {
    await fn();
    return { status: 'up', latencyMs: Date.now() - started };
  } catch (error) {
    return { status: 'down', error: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Liveness: is the process itself alive. Deliberately checks nothing external,
 * because a Redis outage must not make Kubernetes restart a healthy API.
 */
export const checkLiveness = (version: string): HealthReport => ({
  status: 'up',
  uptimeSeconds: Math.round(process.uptime()),
  version,
  checks: {},
});

/**
 * Readiness: can this instance actually serve traffic. The database is
 * required; Redis is not, because the API degrades to no cache rather than
 * refusing orders.
 */
export async function checkReadiness(deps: HealthDeps): Promise<HealthReport> {
  const [database, redis] = await Promise.all([
    timed(() => deps.prisma.$queryRaw`SELECT 1`),
    timed(() => deps.redis.ping()),
  ]);

  return {
    status: database.status === 'up' ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
    version: deps.version,
    checks: { database, redis },
  };
}
