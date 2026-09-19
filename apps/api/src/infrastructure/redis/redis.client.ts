/**
 * Redis connection factory (ioredis).
 */
import { Redis } from 'ioredis';
import type { RedisConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';

export type RedisClient = Redis;

/**
 * Subscribers cannot issue normal commands, and BullMQ needs its own
 * connection settings, so connections are created per purpose rather than
 * shared from one global.
 */
export function createRedis(
  config: RedisConfig,
  logger: Logger,
  purpose: 'commands' | 'subscriber' | 'queue' = 'commands',
): RedisClient {
  const client = new Redis(config.url ?? 'redis://localhost:6379', {
    ...(config.password !== undefined ? { password: config.password } : {}),
    db: config.db,
    // BullMQ requires this to be null; it blocks on its own retry loop.
    maxRetriesPerRequest: purpose === 'queue' ? null : 3,
    enableReadyCheck: purpose !== 'queue',
    lazyConnect: true,
    // Railway's private network resolves `*.railway.internal` to IPv6 only; ioredis
    // defaults to IPv4 lookups and would never find it. 0 = whatever DNS answers.
    family: 0,
    // Commands issued while down queue up rather than throwing, which keeps a
    // brief Redis blip from turning into a wave of 500s.
    enableOfflineQueue: true,
    connectionName: `bazar-${purpose}`,
  });

  client.on('error', (error) => logger.error({ err: error, purpose }, 'redis error'));
  client.on('ready', () => logger.info({ purpose }, 'redis ready'));

  return client;
}

/** Namespaces a key so several environments can share one Redis instance. */
export const key = (config: RedisConfig, ...parts: (string | number)[]): string =>
  `${config.keyPrefix}${parts.join(':')}`;
