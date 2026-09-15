/**
 * Graceful shutdown: stop accepting connections, drain jobs, close prisma/redis.
 */
import type { Logger } from '../infrastructure/logger/index.js';

export interface ShutdownTarget {
  close(): Promise<void>;
}

export interface ShutdownOptions {
  logger: Logger;
  /** Closed in order: HTTP first, then jobs, then the data stores. */
  targets: { name: string; target: ShutdownTarget }[];
  timeoutMs?: number;
}

/**
 * Order matters: stop taking new requests before closing the database, or
 * in-flight handlers start failing on a disconnected client. The timeout is
 * the backstop for a handler that will never finish.
 */
export function registerShutdown({ logger, targets, timeoutMs = 15_000 }: ShutdownOptions): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    // A second Ctrl-C should not start a second teardown.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      logger.error({ timeoutMs }, 'shutdown timed out, exiting');
      process.exit(1);
    }, timeoutMs);
    forceExit.unref();

    for (const { name, target } of targets) {
      try {
        await target.close();
        logger.info({ target: name }, 'closed');
      } catch (error) {
        logger.error({ err: error, target: name }, 'failed to close cleanly');
      }
    }

    clearTimeout(forceExit);
    logger.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection means state we cannot reason about any more.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled rejection');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}
