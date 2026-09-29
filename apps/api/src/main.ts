/**
 * Process entrypoint for @bazar/api.
 */
import { buildContainer, createApp, registerShutdown, startServer } from './app/index.js';
import { loadConfig } from './config/index.js';
import { connectPrisma } from './infrastructure/database/prisma.client.js';
import { initTracing } from './infrastructure/telemetry/tracing.js';
import { registerSchedulers } from './jobs/index.js';
import { runWorkers, type RunningWorkers } from './jobs/worker.js';

/**
 * Boot order, and why:
 *
 *   config    - validated first, so a bad env kills the process here rather
 *               than surfacing as an undefined during someone's checkout
 *   tracing   - the OTel SDK patches http/pg/ioredis, so it must run before
 *               anything imports a connection
 *   container - everything wired once, in dependency order
 *   prisma    - connected eagerly, so a wrong DATABASE_URL fails at startup
 *               instead of on the first request
 *   app       - middleware, routes, websocket
 *   shutdown  - registered before listening, so SIGTERM during boot is handled
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const container = buildContainer(config);
  const { logger } = container;

  const tracing = await initTracing(config.observability, logger);

  try {
    await connectPrisma(container.prisma, logger);

    const app = await createApp(container);
    const server = await startServer(app, config.app);
    await container.services.telegramBot.registerWebhook(config.app.baseUrl);
    // With Redis the queues are BullMQ's, and somebody has to run them: this process does, unless a
    // dedicated worker service is deployed (WORKERS_IN_PROCESS=false).
    let workers: RunningWorkers | null = null;
    if (container.redis !== null && config.redis.workersInProcess) {
      // The API must keep serving even if the queues cannot be run: better orders that wait for
      // a courier search than an API that will not boot.
      workers = await runWorkers(container, config).catch((error: unknown) => {
        logger.error({ err: error }, 'workers failed to start; the API keeps serving');
        return null;
      });
    }
    // Without Redis there is no worker process: the cron schedules run in here.
    if (container.redis === null) {
      const tenant = await container.prisma.tenant.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (tenant !== null) await registerSchedulers(container.queue, tenant.id, logger);
    }

    registerShutdown({
      logger,
      targets: [
        // HTTP first: stop taking work before closing what serves it.
        { name: 'http', target: server },
        ...(workers === null ? [] : [{ name: 'workers', target: workers }]),
        { name: 'container', target: container },
        // Tracing flushes its exporter on shutdown, so it closes last.
        { name: 'tracing', target: { close: () => tracing.shutdown() } },
      ],
    });
  } catch (error) {
    logger.fatal({ err: error }, 'failed to start');
    await container.close();
    await tracing.shutdown();
    process.exit(1);
  }
}

void main();
