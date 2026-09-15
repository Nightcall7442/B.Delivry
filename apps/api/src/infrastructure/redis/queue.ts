/**
 * Queue abstraction (enqueue, schedule, retry). Backing: BullMQ — see jobs/.
 */
import { Queue, type JobsOptions } from 'bullmq';
import type { RedisConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';
import type { RedisClient } from './redis.client.js';

export interface EnqueueOptions {
  /** Same id twice = one job. The guard against double courier searches. */
  jobId?: string;
  delayMs?: number;
  attempts?: number;
  priority?: number;
}

export interface JobQueue {
  enqueue<T>(queue: string, name: string, payload: T, options?: EnqueueOptions): Promise<void>;
  /** Repeatable job, cron in the Asia/Tashkent zone. */
  schedule<T>(queue: string, name: string, payload: T, cron: string): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  // Exponential backoff: a provider that is down stays down for a minute, and
  // hammering it makes it worse.
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  // Failures are kept long enough to be looked at on the next working day.
  removeOnFail: { age: 7 * 24 * 3600 },
};

export class BullQueue implements JobQueue {
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly connection: RedisClient,
    private readonly config: RedisConfig,
    private readonly logger: Logger,
  ) {}

  private queue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing !== undefined) return existing;
    const queue = new Queue(name, {
      connection: this.connection,
      prefix: `${this.config.keyPrefix}bull`,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    this.queues.set(name, queue);
    return queue;
  }

  async enqueue<T>(
    queueName: string,
    name: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<void> {
    await this.queue(queueName).add(name, payload, {
      ...(options.jobId !== undefined ? { jobId: options.jobId } : {}),
      ...(options.delayMs !== undefined ? { delay: options.delayMs } : {}),
      ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
      ...(options.priority !== undefined ? { priority: options.priority } : {}),
    });
    this.logger.debug({ queue: queueName, name, jobId: options.jobId }, 'job enqueued');
  }

  async schedule<T>(queueName: string, name: string, payload: T, cron: string): Promise<void> {
    await this.queue(queueName).add(name, payload, {
      repeat: { pattern: cron, tz: 'Asia/Tashkent' },
      // Repeatable jobs are re-registered on every boot; a stable id keeps
      // restarts from stacking up duplicate schedules.
      jobId: `repeat:${name}`,
    });
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}

/** Runs jobs inline. Lets tests and a Redis-less dev run exercise job code. */
export class InlineQueue implements JobQueue {
  constructor(
    private readonly handlers: Map<string, (payload: unknown) => Promise<void>>,
    private readonly logger: Logger,
  ) {}

  async enqueue<T>(queueName: string, name: string, payload: T): Promise<void> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      this.logger.warn({ queue: queueName, name }, 'no inline handler for job');
      return;
    }
    await handler(payload);
  }

  async schedule(): Promise<void> {
    // Cron makes no sense inline; schedulers are a no-op here.
  }

  async close(): Promise<void> {
    // Nothing to close.
  }
}
