/**
 * RateLimiter interface (sliding window / token bucket).
 */
import type { RedisConfig } from '../../config/index.js';
import { key, type RedisClient } from './redis.client.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window frees up. */
  retryAfter: number;
}

export interface RateLimiter {
  consume(bucket: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  reset(bucket: string): Promise<void>;
}

/**
 * Fixed window: INCR plus an EXPIRE on first hit. It can let through up to 2x
 * the limit across a window boundary, which is fine for abuse control and is
 * two Redis commands instead of a sorted set per caller.
 *
 * The OTP and login limits that actually protect accounts are enforced
 * separately in the auth service against the database, where the count is exact.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: RedisConfig,
  ) {}

  async consume(bucket: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const windowKey = key(this.config, 'rl', bucket, Math.floor(Date.now() / windowMs));

    const results = await this.redis
      .multi()
      .incr(windowKey)
      .pexpire(windowKey, windowMs, 'NX')
      .exec();

    // exec() returns null when the transaction was discarded. Treating that as
    // "no requests counted" fails open, which is the right call for a limiter:
    // a Redis blip must not lock every customer out of the app.
    const count = Number(results?.[0]?.[1] ?? 0);
    const remaining = Math.max(0, limit - count);

    return {
      allowed: count <= limit,
      remaining,
      retryAfter: remaining > 0 ? 0 : Math.ceil(windowMs / 1000),
    };
  }

  async reset(bucket: string): Promise<void> {
    const pattern = key(this.config, 'rl', bucket, '*');
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}

/** Used in tests and when the API runs without Redis. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(bucket: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.buckets.get(bucket);
    if (entry === undefined || entry.resetAt <= now) {
      this.buckets.set(bucket, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfter: 0 };
    }
    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    return {
      allowed: entry.count <= limit,
      remaining,
      retryAfter: remaining > 0 ? 0 : Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  async reset(bucket: string): Promise<void> {
    this.buckets.delete(bucket);
  }
}
