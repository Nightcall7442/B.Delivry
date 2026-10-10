/**
 * The process ends the way it always has: an unhandled rejection or an uncaught exception is
 * logged, everything is closed in order and the process exits. Error reporting rides along: the
 * failure is queued on the way in, and the last thing closed sends it. It decides nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { registerShutdown } from '../../src/app/shutdown.js';
import {
  errorReportingShutdownTarget,
  noopErrorReporter,
  setErrorReporter,
  type ErrorContext,
  type ErrorReporter,
} from '../../src/infrastructure/telemetry/error-reporting.js';

const SIGNALS = ['unhandledRejection', 'uncaughtException', 'SIGTERM', 'SIGINT'] as const;

type Listener = (...args: unknown[]) => void;
const emitter: NodeJS.EventEmitter = process;
let saved: Map<string, Listener[]>;
let exit: MockInstance<typeof process.exit>;

beforeEach(() => {
  // The test runner listens to these too (and would count a rejection raised here as a failure):
  // set its listeners aside, and put them back.
  saved = new Map(SIGNALS.map((name) => [name, [...emitter.listeners(name)] as Listener[]]));
  for (const name of SIGNALS) process.removeAllListeners(name);
  exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  for (const name of SIGNALS) {
    process.removeAllListeners(name);
    for (const listener of saved.get(name) ?? []) process.on(name, listener as never);
  }
  exit.mockRestore();
  setErrorReporter(noopErrorReporter);
});

function setup(reporter: ErrorReporter) {
  const order: string[] = [];
  const logger = { info: vi.fn(), error: vi.fn(), fatal: vi.fn() };
  setErrorReporter(reporter);
  registerShutdown({
    logger: logger as never,
    targets: [
      { name: 'http', target: { close: async () => void order.push('http') } },
      { name: 'container', target: { close: async () => void order.push('container') } },
      {
        name: 'error-reporting',
        target: {
          close: async () => {
            order.push('error-reporting');
            await errorReportingShutdownTarget(reporter).close();
          },
        },
      },
    ],
  });
  return { order, logger };
}

function recorder() {
  const reports: { error: unknown; context: ErrorContext | undefined }[] = [];
  const flushes: number[] = [];
  const reporter: ErrorReporter = {
    capture: (error, context) => void reports.push({ error, context }),
    flush: async (timeoutMs) => {
      flushes.push(timeoutMs);
      return true;
    },
  };
  return { reporter, reports, flushes };
}

describe('an unhandled rejection', () => {
  it('is reported as fatal, then the process shuts down as before', async () => {
    const { reporter, reports, flushes } = recorder();
    const { order, logger } = setup(reporter);
    const reason = new Error('lost promise');

    process.emit('unhandledRejection', reason, Promise.resolve());

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(logger.fatal).toHaveBeenCalledTimes(1);
    expect(reports).toEqual([
      {
        error: reason,
        context: { level: 'fatal', tags: { source: 'process', event: 'unhandledRejection' } },
      },
    ]);
    // Everything is closed in the order it was registered, the reports last, and with a time limit.
    expect(order).toEqual(['http', 'container', 'error-reporting']);
    expect(flushes).toEqual([2000]);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('shuts down all the same when the reporter throws', async () => {
    const { order } = setup({
      capture: () => {
        throw new Error('reporter is broken');
      },
      flush: async () => true,
    });

    process.emit('unhandledRejection', new Error('lost promise'), Promise.resolve());

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(order).toEqual(['http', 'container', 'error-reporting']);
  });
});

describe('an uncaught exception', () => {
  it('is reported as fatal, then the process shuts down as before', async () => {
    const { reporter, reports } = recorder();
    const { order } = setup(reporter);
    const error = new Error('thrown from a timer');

    process.emit('uncaughtException', error);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(reports).toEqual([
      {
        error,
        context: { level: 'fatal', tags: { source: 'process', event: 'uncaughtException' } },
      },
    ]);
    expect(order).toEqual(['http', 'container', 'error-reporting']);
  });
});

describe('a signal', () => {
  it('shuts down and flushes the reports, and reports nothing', async () => {
    const { reporter, reports, flushes } = recorder();
    const { order } = setup(reporter);

    process.emit('SIGTERM');

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(reports).toEqual([]);
    expect(order).toEqual(['http', 'container', 'error-reporting']);
    expect(flushes).toEqual([2000]);
  });
});
