/**
 * Redis configuration slice.
 */
import type { Env } from './env.schema.js';

export interface RedisConfig {
  /** Missing when the deployment runs without Redis. */
  url?: string;
  password?: string;
  db: number;
  /** Prefixes every key so several environments can share one Redis. */
  keyPrefix: string;
}

export function buildRedisConfig(env: Env): RedisConfig {
  return {
    ...(env.REDIS_URL !== undefined ? { url: env.REDIS_URL } : {}),
    ...(env.REDIS_PASSWORD !== undefined ? { password: env.REDIS_PASSWORD } : {}),
    db: env.REDIS_DB,
    keyPrefix: env.REDIS_KEY_PREFIX,
  };
}
