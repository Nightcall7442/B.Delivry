/**
 * Database configuration slice.
 */
import type { Env } from './env.schema.js';

export interface DatabaseConfig {
  url: string;
  poolMin: number;
  poolMax: number;
  /** Log every query in development; log only slow ones in production. */
  logQueries: boolean;
  slowQueryMs: number;
}

export function buildDatabaseConfig(env: Env): DatabaseConfig {
  return {
    url: env.DATABASE_URL,
    poolMin: env.DATABASE_POOL_MIN,
    poolMax: env.DATABASE_POOL_MAX,
    logQueries: env.NODE_ENV === 'development',
    slowQueryMs: 500,
  };
}
