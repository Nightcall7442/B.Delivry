/**
 * Without Redis the queue is the in-process one: no retries, so the first failure of a job is the
 * last. It is reported the way a BullMQ job out of attempts is, and the data stays out of it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildContainer } from '../../src/app/container.js';
import { loadConfig } from '../../src/config/index.js';
import {
  noopErrorReporter,
  setErrorReporter,
  type ErrorContext,
} from '../../src/infrastructure/telemetry/error-reporting.js';

const env = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  SESSION_SECRET: 'c'.repeat(32),
};

afterEach(() => {
  setErrorReporter(noopErrorReporter);
});

describe('a job that fails in the in-process queue', () => {
  async function run(handler: () => Promise<void>) {
    const reports: { error: unknown; context: ErrorContext | undefined }[] = [];
    setErrorReporter({
      capture: (error, context) => void reports.push({ error, context }),
      flush: async () => true,
    });
    const container = buildContainer(loadConfig(env), {
      prisma: { $disconnect: async () => undefined } as never,
      withoutRedis: true,
    });
    // The queue is built with the job handlers of the app; this one is the test's own.
    (container.queue as unknown as { bind(h: Map<string, () => Promise<void>>): void }).bind(
      new Map([['boom', handler]]),
    );
    await container.queue.enqueue('notifications', 'boom', {
      phone: '+998901234567',
      note: 'SECRET-DATA',
    });
    await vi.waitFor(() => expect(reports.length).toBeGreaterThan(0));
    await container.close();
    return reports;
  }

  it('is reported with its queue and name, and one attempt', async () => {
    const error = new Error('smtp down');

    const reports = await run(async () => {
      throw error;
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]?.error).toBe(error);
    expect(reports[0]?.context).toEqual({
      tags: { source: 'job', queue: 'notifications', job: 'boom', attempts: 1 },
    });
  });

  it('carries no part of its data', async () => {
    const reports = await run(async () => {
      throw new Error('x');
    });

    const context = JSON.stringify(reports[0]?.context);
    expect(context).not.toContain('998901234567');
    expect(context).not.toContain('SECRET-DATA');
  });
});
