/**
 * Distributed lock (e.g. courier assignment must be exclusive).
 */
import { randomUUID } from 'node:crypto';
import type { RedisConfig } from '../../config/index.js';
import { key, type RedisClient } from './redis.client.js';

export interface Lock {
  release(): Promise<void>;
}

/** Releases only if we still hold it: a lock that expired belongs to someone else. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * SET NX PX with a random token. Enough for "two API instances must not assign
 * the same order to two couriers", which is the only thing it is used for.
 *
 * ponytail: single-instance Redis lock, not Redlock. If the platform ever runs
 * a Redis cluster where a failover can lose the key, revisit this.
 */
export class RedisLock {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: RedisConfig,
  ) {}

  async acquire(name: string, ttlMs = 10_000): Promise<Lock | null> {
    const lockKey = key(this.config, 'lock', name);
    const token = randomUUID();
    const result = await this.redis.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (result !== 'OK') return null;

    return {
      release: async () => {
        await this.redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
      },
    };
  }

  /**
   * Runs `fn` under the lock, or returns null if someone else holds it.
   * Callers decide what "someone else is already doing this" means; usually
   * it means skip, because the other worker will finish the job.
   */
  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const lock = await this.acquire(name, ttlMs);
    if (lock === null) return null;
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
