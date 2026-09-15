/**
 * SessionStore interface: refresh tokens / device sessions.
 */
import type { RedisConfig } from '../../config/index.js';
import { key, type RedisClient } from './redis.client.js';

/**
 * Sessions live in Postgres (the Session model) because they must survive a
 * Redis flush and be listable in the UI. What lives here is only the fast
 * revocation check the auth middleware runs on every single request.
 */
export interface SessionStore {
  /** Marks a session dead until its token would have expired anyway. */
  revoke(sessionId: string, ttlSeconds: number): Promise<void>;
  isRevoked(sessionId: string): Promise<boolean>;
  /** Kills every session of a user (password change, account block). */
  revokeAllForUser(userId: string, sessionIds: string[], ttlSeconds: number): Promise<void>;
  touch(sessionId: string, ttlSeconds: number): Promise<void>;
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: RedisConfig,
  ) {}

  private revokedKey(sessionId: string): string {
    return key(this.config, 'session-revoked', sessionId);
  }

  async revoke(sessionId: string, ttlSeconds: number): Promise<void> {
    // TTL matches the access token lifetime: after that the token is invalid
    // on its own and the entry is dead weight.
    await this.redis.set(this.revokedKey(sessionId), '1', 'EX', Math.max(1, ttlSeconds));
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(this.revokedKey(sessionId))) === 1;
  }

  async revokeAllForUser(_userId: string, sessionIds: string[], ttlSeconds: number): Promise<void> {
    if (sessionIds.length === 0) return;
    const pipeline = this.redis.multi();
    for (const id of sessionIds) {
      pipeline.set(this.revokedKey(id), '1', 'EX', Math.max(1, ttlSeconds));
    }
    await pipeline.exec();
  }

  async touch(sessionId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      key(this.config, 'session-seen', sessionId),
      Date.now().toString(),
      'EX',
      ttlSeconds,
    );
  }
}

/** No Redis: nothing is revoked early, tokens simply expire. Tests only. */
export class MemorySessionStore implements SessionStore {
  private readonly revoked = new Set<string>();

  async revoke(sessionId: string): Promise<void> {
    this.revoked.add(sessionId);
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return this.revoked.has(sessionId);
  }

  async revokeAllForUser(_userId: string, sessionIds: string[]): Promise<void> {
    for (const id of sessionIds) this.revoked.add(id);
  }

  async touch(): Promise<void> {
    // Nothing to keep warm in memory.
  }
}
