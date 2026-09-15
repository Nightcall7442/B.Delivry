/**
 * Singleton PrismaClient with logging + tenant middleware/extension hook.
 */
import { PrismaClient } from '@prisma/client';
import type { DatabaseConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';

export interface PrismaDeps {
  config: DatabaseConfig;
  logger: Logger;
}

/**
 * One client per process. Prisma manages its own pool, and a second client
 * would quietly double the connection count against Postgres.
 */
export function createPrismaClient({ config, logger }: PrismaDeps): PrismaClient {
  const prisma = new PrismaClient({
    datasources: { db: { url: config.url } },
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

  prisma.$on('warn', (event) => logger.warn({ prisma: event }, 'prisma warning'));
  prisma.$on('error', (event) => logger.error({ prisma: event }, 'prisma error'));

  // Full query logging is a development tool. In production only slow queries
  // are logged, so an index regression shows up without drowning the log.
  prisma.$on('query', (event) => {
    if (config.logQueries) {
      logger.debug({ query: event.query, params: event.params, ms: event.duration }, 'query');
      return;
    }
    if (event.duration >= config.slowQueryMs) {
      logger.warn({ query: event.query, ms: event.duration }, 'slow query');
    }
  });

  return prisma;
}

/** Prisma opens lazily; connect at boot so a bad DATABASE_URL fails at startup. */
export async function connectPrisma(prisma: PrismaClient, logger: Logger): Promise<void> {
  await prisma.$connect();
  logger.info('database connected');
}

export async function disconnectPrisma(prisma: PrismaClient): Promise<void> {
  await prisma.$disconnect();
}
