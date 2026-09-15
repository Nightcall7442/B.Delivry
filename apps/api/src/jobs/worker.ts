/**
 * Worker bootstrap (can run as separate process: node dist/jobs/worker.js).
 */
import { Worker, type Job } from 'bullmq';
import { buildContainer } from '../app/container.js';
import { registerShutdown } from '../app/shutdown.js';
import { loadConfig } from '../config/index.js';
import { createRedis } from '../infrastructure/redis/redis.client.js';
import { jobDuration } from '../infrastructure/telemetry/metrics.js';
import { buildJobHandlers, registerSchedulers } from './index.js';
import { QUEUE, type JobName, type QueueName } from './queues.js';

/**
 * Runs the queues in their own process, so a flood of location writes or a
 * slow SMS gateway cannot eat the concurrency the HTTP API needs.
 *
 * Concurrency is per queue: notifications are IO-bound and can run wide,
 * while payments touch money and stay narrow.
 */
const CONCURRENCY: Record<QueueName, number> = {
  [QUEUE.DELIVERY]: 10,
  [QUEUE.NOTIFICATIONS]: 20,
  [QUEUE.PAYMENTS]: 3,
  [QUEUE.TRACKING]: 10,
  [QUEUE.MAINTENANCE]: 1,
  [QUEUE.ANALYTICS]: 2,
};

export async function startWorkers(): Promise<void> {
  const config = loadConfig();
  const container = buildContainer(config);
  const handlers = buildJobHandlers(container);
  const connection = createRedis(config.redis, container.logger, 'queue');

  const workers = Object.values(QUEUE).map((queueName) => {
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const handler = handlers.get(job.name as JobName);
        if (handler === undefined) {
          container.logger.error({ queue: queueName, job: job.name }, 'no handler for job');
          return;
        }

        const started = Date.now();
        try {
          await handler(job.data as never);
          jobDuration.labels(queueName, job.name, 'ok').observe((Date.now() - started) / 1000);
        } catch (error) {
          jobDuration.labels(queueName, job.name, 'error').observe((Date.now() - started) / 1000);
          // Rethrown so BullMQ applies its backoff and retry policy.
          throw error;
        }
      },
      {
        connection,
        prefix: `${config.redis.keyPrefix}bull`,
        concurrency: CONCURRENCY[queueName],
      },
    );

    worker.on('failed', (job, error) => {
      container.logger.error(
        { queue: queueName, job: job?.name, attempt: job?.attemptsMade, err: error },
        'job failed',
      );
    });

    return worker;
  });

  const tenant = await container.prisma.tenant.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (tenant !== null) {
    await registerSchedulers(container.queue, tenant.id, container.logger);
  }

  container.logger.info({ queues: Object.values(QUEUE) }, 'workers started');

  registerShutdown({
    logger: container.logger,
    targets: [
      {
        name: 'workers',
        target: { close: async () => void (await Promise.all(workers.map((w) => w.close()))) },
      },
      { name: 'container', target: container },
    ],
  });
}

// Only self-starts when run directly, so importing this file in a test does
// not spin up a worker pool.
if (
  process.argv[1]?.endsWith('worker.js') === true ||
  process.argv[1]?.endsWith('worker.ts') === true
) {
  void startWorkers();
}
