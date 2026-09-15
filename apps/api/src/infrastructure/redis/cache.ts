/**
 * CacheStore interface: get/set/del/ttl/invalidateByTag.
 */
import type { RedisConfig } from '../../config/index.js';
import { key, type RedisClient } from './redis.client.js';

export interface CacheStore {
  get<T>(cacheKey: string): Promise<T | null>;
  set<T>(cacheKey: string, value: T, ttlSeconds?: number, tags?: string[]): Promise<void>;
  del(cacheKey: string): Promise<void>;
  ttl(cacheKey: string): Promise<number>;
  /** Drops every entry written under a tag, e.g. every list for one store. */
  invalidateByTag(tag: string): Promise<void>;
}

const DEFAULT_TTL = 300;

/**
 * Tags are Redis sets holding the keys written under them, so invalidating a
 * tag is one SMEMBERS plus one DEL. This avoids KEYS/SCAN patterns, which get
 * slower exactly when the cache is worth having.
 */
export class RedisCache implements CacheStore {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: RedisConfig,
  ) {}

  private k(cacheKey: string): string {
    return key(this.config, 'cache', cacheKey);
  }

  private tagKey(tag: string): string {
    return key(this.config, 'cache-tag', tag);
  }

  async get<T>(cacheKey: string): Promise<T | null> {
    const raw = await this.redis.get(this.k(cacheKey));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A poisoned entry must not break the request: drop it and miss.
      await this.del(cacheKey);
      return null;
    }
  }

  async set<T>(
    cacheKey: string,
    value: T,
    ttlSeconds = DEFAULT_TTL,
    tags: string[] = [],
  ): Promise<void> {
    const full = this.k(cacheKey);
    const pipeline = this.redis.multi().set(full, JSON.stringify(value), 'EX', ttlSeconds);
    for (const tag of tags) {
      // Tag sets outlive their entries slightly; the extra TTL keeps them from
      // expiring mid-write and losing track of live keys.
      pipeline.sadd(this.tagKey(tag), full).expire(this.tagKey(tag), ttlSeconds + 60);
    }
    await pipeline.exec();
  }

  async del(cacheKey: string): Promise<void> {
    await this.redis.del(this.k(cacheKey));
  }

  async ttl(cacheKey: string): Promise<number> {
    return this.redis.ttl(this.k(cacheKey));
  }

  async invalidateByTag(tag: string): Promise<void> {
    const tagKey = this.tagKey(tag);
    const members = await this.redis.smembers(tagKey);
    if (members.length > 0) await this.redis.del(...members);
    await this.redis.del(tagKey);
  }
}

/** In-memory stand-in for tests and for running the API without Redis. */
export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly tags = new Map<string, Set<string>>();

  async get<T>(cacheKey: string): Promise<T | null> {
    const entry = this.store.get(cacheKey);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(cacheKey);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(
    cacheKey: string,
    value: T,
    ttlSeconds = DEFAULT_TTL,
    tags: string[] = [],
  ): Promise<void> {
    this.store.set(cacheKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    for (const tag of tags) {
      const set = this.tags.get(tag) ?? new Set<string>();
      set.add(cacheKey);
      this.tags.set(tag, set);
    }
  }

  async del(cacheKey: string): Promise<void> {
    this.store.delete(cacheKey);
  }

  async ttl(cacheKey: string): Promise<number> {
    const entry = this.store.get(cacheKey);
    if (entry === undefined) return -2;
    return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
  }

  async invalidateByTag(tag: string): Promise<void> {
    for (const cacheKey of this.tags.get(tag) ?? []) this.store.delete(cacheKey);
    this.tags.delete(tag);
  }
}

/** Read-through helper: the only cache shape most call sites need. */
export async function cached<T>(
  cache: CacheStore,
  cacheKey: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  tags: string[] = [],
): Promise<T> {
  const hit = await cache.get<T>(cacheKey);
  if (hit !== null) return hit;
  const value = await load();
  await cache.set(cacheKey, value, ttlSeconds, tags);
  return value;
}
