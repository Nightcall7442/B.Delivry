/**
 * Queue jobs and error reports. BullMQ retries a failed job with backoff, and most failures are a
 * provider having a bad minute: those are logged. A job that is out of attempts is lost work, and
 * that is reported: its queue, its name and its attempts, never its data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  noopErrorReporter,
  setErrorReporter,
  type ErrorContext,
  type ErrorReporter,
} from '../../src/infrastructure/telemetry/error-reporting.js';
import { hasExhaustedAttempts, reportFailedJob } from '../../src/jobs/report-failure.js';

interface FakeWorker {
  queue: string;
  handlers: Map<string, (...args: unknown[]) => void>;
}

const bull = vi.hoisted(() => ({ workers: [] as unknown[] }));

vi.mock('bullmq', () => ({
  Worker: class {
    readonly handlers = new Map<string, (...args: unknown[]) => void>();
    constructor(readonly queue: string) {
      bull.workers.push(this);
    }
    on(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers.set(event, handler);
      return this;
    }
    async close(): Promise<void> {}
  },
}));
vi.mock('../../src/app/container.js', () => ({ buildContainer: vi.fn() }));
vi.mock('../../src/infrastructure/redis/redis.client.js', () => ({
  createRedis: () => ({ quit: async () => undefined }),
}));
vi.mock('../../src/jobs/index.js', () => ({
  buildJobHandlers: () => new Map(),
  registerSchedulers: async () => undefined,
}));
vi.mock('../../src/jobs/recover.js', () => ({ requeueStalledSearches: async () => undefined }));

function recorder(): ErrorReporter & { reports: { error: unknown; context?: ErrorContext }[] } {
  const reports: { error: unknown; context?: ErrorContext }[] = [];
  return {
    reports,
    capture: (error, context) => {
      reports.push({ error, ...(context !== undefined ? { context } : {}) });
    },
    flush: async () => true,
  };
}

/** What BullMQ hands to `failed`: the job after the attempt was counted. */
const job = (over: Record<string, unknown> = {}): never =>
  ({
    name: 'send-notification',
    attemptsMade: 5,
    opts: { attempts: 5 },
    finishedOn: 1_760_000_000_000,
    data: { phone: '+998901234567', orderId: 'o-1', message: 'SECRET-DATA' },
    ...over,
  }) as never;

afterEach(() => {
  setErrorReporter(noopErrorReporter);
});

describe('which failures are out of attempts', () => {
  it('is the last attempt, or a job that BullMQ moved to the failed set', () => {
    expect(hasExhaustedAttempts(job({ attemptsMade: 5, finishedOn: 1 }))).toBe(true);
    expect(hasExhaustedAttempts(job({ attemptsMade: 5, finishedOn: undefined }))).toBe(true);
    // An UnrecoverableError, or job.discard(): failed for good with attempts to spare.
    expect(hasExhaustedAttempts(job({ attemptsMade: 1, finishedOn: 1 }))).toBe(true);
  });

  it('is not an attempt with retries left', () => {
    expect(hasExhaustedAttempts(job({ attemptsMade: 1, finishedOn: undefined }))).toBe(false);
    expect(hasExhaustedAttempts(job({ attemptsMade: 4, finishedOn: undefined }))).toBe(false);
  });

  it('counts a job without a retry policy as one attempt', () => {
    expect(hasExhaustedAttempts(job({ opts: {}, attemptsMade: 1, finishedOn: undefined }))).toBe(
      true,
    );
  });
});

describe('reporting a failed job', () => {
  it('reports the error with the queue, the job name and the attempts', () => {
    const reporter = recorder();
    const error = new Error('provider down');

    reportFailedJob('notifications', job(), error, reporter);

    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.error).toBe(error);
    expect(reporter.reports[0]?.context).toEqual({
      tags: { source: 'job', queue: 'notifications', job: 'send-notification', attempts: 5 },
    });
  });

  it('never carries the job data', () => {
    const reporter = recorder();

    reportFailedJob('notifications', job(), new Error('x'), reporter);

    const context = JSON.stringify(reporter.reports[0]?.context);
    for (const secret of ['998901234567', 'SECRET-DATA', 'o-1']) {
      expect(context, secret).not.toContain(secret);
    }
  });

  it('stays quiet while the retries last', () => {
    const reporter = recorder();

    reportFailedJob(
      'payments',
      job({ attemptsMade: 2, finishedOn: undefined }),
      new Error('x'),
      reporter,
    );

    expect(reporter.reports).toEqual([]);
  });

  it('has nothing to say about a failure it cannot attribute to a job', () => {
    const reporter = recorder();
    reportFailedJob('payments', undefined, new Error('x'), reporter);
    expect(reporter.reports).toEqual([]);
  });

  it('survives a reporter that throws', () => {
    const throwing: ErrorReporter = {
      capture: () => {
        throw new Error('reporter is broken');
      },
      flush: async () => true,
    };
    expect(() => reportFailedJob('payments', job(), new Error('x'), throwing)).not.toThrow();
  });
});

describe('the workers', () => {
  beforeEach(() => {
    bull.workers.length = 0;
  });

  async function started() {
    const { runWorkers } = await import('../../src/jobs/worker.js');
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
    const container = {
      logger,
      prisma: { tenant: { findFirst: async () => null } },
      queue: {},
    };
    await runWorkers(container as never, { redis: { keyPrefix: 'bazar:' } } as never);
    const workers = bull.workers as FakeWorker[];
    const failed = (queue: string) => {
      const handler = workers.find((w) => w.queue === queue)?.handlers.get('failed');
      if (handler === undefined) throw new Error(`no failed listener on ${queue}`);
      return handler;
    };
    return { logger, workers, failed };
  }

  it('report a job that fails for good, and still log every failure', async () => {
    const reporter = recorder();
    setErrorReporter(reporter);
    const { logger, failed } = await started();
    const error = new Error('smtp down');

    failed('notifications')(job({ attemptsMade: 2, finishedOn: undefined }), error);
    expect(reporter.reports).toEqual([]);

    failed('notifications')(job(), error);
    expect(reporter.reports).toHaveLength(1);
    expect(reporter.reports[0]?.context?.tags).toMatchObject({
      queue: 'notifications',
      job: 'send-notification',
      attempts: 5,
    });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('do not let a broken reporter hide the failure from the log or break the listener', async () => {
    setErrorReporter({
      capture: () => {
        throw new Error('reporter is broken');
      },
      flush: async () => true,
    });
    const { logger, failed } = await started();

    expect(() => failed('payments')(job(), new Error('x'))).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
