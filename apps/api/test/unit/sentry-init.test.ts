/**
 * Starting error reporting. Without a DSN the SDK is not even imported; with one it starts for
 * errors only, with the integrations that change how the process ends left out, and what it
 * sends goes through the scrubber. A reporter that fails, or hangs, never holds the API up.
 */
import type { ErrorEvent } from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorReportingConfig } from '../../src/config/index.js';
import type { Logger } from '../../src/infrastructure/logger/index.js';

const sdk = vi.hoisted(() => ({
  /** How many times the module factory ran, i.e. how many times anything imported the SDK. */
  imported: 0,
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(),
}));

vi.mock('@sentry/node', () => {
  sdk.imported += 1;
  const integration = (name: string) => () => ({ name });
  return {
    init: sdk.init,
    captureException: sdk.captureException,
    flush: sdk.flush,
    eventFiltersIntegration: integration('EventFilters'),
    functionToStringIntegration: integration('FunctionToString'),
    linkedErrorsIntegration: integration('LinkedErrors'),
    contextLinesIntegration: integration('ContextLines'),
    nodeContextIntegration: integration('Context'),
    systemErrorIntegration: integration('NodeSystemError'),
  };
});

const DSN = 'https://abc123@o1.ingest.de.sentry.io/456789';
const config = (extra: Partial<ErrorReportingConfig> = {}): ErrorReportingConfig => ({
  dsn: DSN,
  environment: 'production',
  release: 'c0ffee',
  ...extra,
});

const logger = () =>
  ({ warn: vi.fn(), info: vi.fn() }) as unknown as Logger & {
    warn: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

/** A fresh copy of the module under test: its reporter and the mocked SDK are loaded afresh. */
const load = async () => {
  vi.resetModules();
  return import('../../src/infrastructure/telemetry/error-reporting.js');
};

const initOptions = () => sdk.init.mock.calls[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  sdk.imported = 0;
  sdk.init.mockReset();
  sdk.captureException.mockReset();
  sdk.flush.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('without a DSN', () => {
  it('imports nothing, starts nothing and reports nothing', async () => {
    const { initErrorReporting, noopErrorReporter } = await load();
    const log = logger();

    const reporter = await initErrorReporting(config({ dsn: undefined }), log);

    expect(reporter).toBe(noopErrorReporter);
    expect(sdk.imported).toBe(0);
    expect(sdk.init).not.toHaveBeenCalled();
    reporter.capture(new Error('x'), { tags: { a: 'b' }, userId: 'u1' });
    expect(await reporter.flush(10)).toBe(true);
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.flush).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('is the process reporter until something sets another', async () => {
    const { getErrorReporter, noopErrorReporter, setErrorReporter } = await load();
    expect(getErrorReporter()).toBe(noopErrorReporter);
    const other = { capture: vi.fn(), flush: vi.fn() };
    setErrorReporter(other);
    expect(getErrorReporter()).toBe(other);
  });
});

describe('with a DSN that is not one', () => {
  it.each(['not a url', 'ftp://k@h/1', 'https://abc123@o1.ingest.sentry.io/none'])(
    'warns, runs without reporting and never loads the SDK: %s',
    async (dsn) => {
      const { initErrorReporting, noopErrorReporter } = await load();
      const log = logger();

      const reporter = await initErrorReporting(config({ dsn }), log);

      expect(reporter).toBe(noopErrorReporter);
      expect(sdk.imported).toBe(0);
      expect(log.warn).toHaveBeenCalledTimes(1);
      // The value is wrong, and a credential besides: it stays out of the log.
      expect(JSON.stringify(log.warn.mock.calls)).not.toContain(dsn);
    },
  );
});

describe('with a DSN', () => {
  it('starts the SDK once, with the environment and the release', async () => {
    const { initErrorReporting } = await load();

    await initErrorReporting(config(), logger());

    expect(sdk.imported).toBe(1);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(initOptions()).toMatchObject({
      dsn: DSN,
      environment: 'production',
      release: 'c0ffee',
    });
  });

  it('leaves the release out when there is none', async () => {
    const { initErrorReporting } = await load();
    await initErrorReporting(config({ release: undefined }), logger());
    expect(initOptions()).not.toHaveProperty('release');
  });

  it('reports errors only: no tracing, profiles, logs, metrics, breadcrumbs or personal data', async () => {
    const { initErrorReporting } = await load();

    await initErrorReporting(config(), logger());

    const options = initOptions();
    expect(options.sendDefaultPii).toBe(false);
    expect(options.enableLogs).toBe(false);
    expect(options.enableMetrics).toBe(false);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.sendClientReports).toBe(false);
    for (const key of [
      'tracesSampleRate',
      'tracesSampler',
      'profilesSampleRate',
      'profilesSampler',
      'profileSessionSampleRate',
      'profileLifecycle',
      'replaysSessionSampleRate',
      'replaysOnErrorSampleRate',
      'dataCollection',
      'spotlight',
    ]) {
      expect(options, key).not.toHaveProperty(key);
    }
  });

  it('tags every report with the service', async () => {
    const { initErrorReporting } = await load();
    await initErrorReporting(config(), logger());
    expect(initOptions().initialScope).toEqual({ tags: { service: 'api' } });
  });

  it('never registers OpenTelemetry or its loader hooks, whether or not tracing is on', async () => {
    const { initErrorReporting } = await load();
    await initErrorReporting(config(), logger());
    expect(initOptions().skipOpenTelemetrySetup).toBe(true);
    expect(initOptions().registerEsmLoaderHooks).toBe(false);
  });

  it('lists its integrations instead of inheriting the SDK defaults', async () => {
    const { initErrorReporting } = await load();
    await initErrorReporting(config(), logger());

    const options = initOptions();
    expect(Array.isArray(options.defaultIntegrations)).toBe(true);
    expect((options.defaultIntegrations as { name: string }[]).map((i) => i.name)).toEqual([
      'EventFilters',
      'FunctionToString',
      'LinkedErrors',
      'ContextLines',
      'Context',
      'NodeSystemError',
    ]);
    expect(options).not.toHaveProperty('integrations');
  });

  it('starts the real SDK without the integrations that would change how the process ends', async () => {
    // Not the mock: the names the SDK itself gives its integrations. Nothing is started here.
    const real = await vi.importActual<typeof import('@sentry/node')>('@sentry/node');
    const { buildSentryOptions } = await load();

    const options = buildSentryOptions(real, { ...config(), dsn: DSN });
    const names = (options.defaultIntegrations as { name: string }[]).map((i) => i.name);

    expect(names).toHaveLength(6);
    for (const forbidden of [
      'OnUncaughtException', // exits 1 after its own flush when it is the only listener
      'OnUnhandledRejection', // replaces Node's crash-on-rejection while no handler of ours exists
      'ProcessSession',
      'Http', // breadcrumbs with the URL: the Telegram bot token is in it
      'NodeFetch',
      'Console',
      'LocalVariables',
      'ChildProcess',
      'RequestData',
    ]) {
      expect(names, forbidden).not.toContain(forbidden);
    }
  });

  it('sends every event through the scrubber, and drops what is not ours to send', async () => {
    const { initErrorReporting } = await load();
    await initErrorReporting(config(), logger());

    const beforeSend = initOptions().beforeSend as (e: ErrorEvent, hint: object) => ErrorEvent;
    const sent = beforeSend(
      {
        message: 'call +998 90 123 45 67',
        request: { headers: { cookie: 'sid=1' }, data: { a: 1 } },
        user: { id: 'u1', ip_address: '1.2.3.4', email: 'a@b.c' },
      } as unknown as ErrorEvent,
      {},
    );

    expect(sent.message).toBe('call [phone]');
    expect(sent.request).toEqual({});
    expect(sent.user).toEqual({ id: 'u1' });
  });

  it('survives an SDK that will not start: a warning, and the API runs without it', async () => {
    const { initErrorReporting, noopErrorReporter } = await load();
    sdk.init.mockImplementation(() => {
      throw new Error('sdk exploded');
    });
    const log = logger();

    const reporter = await initErrorReporting(config(), log);

    expect(reporter).toBe(noopErrorReporter);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});

describe('capturing', () => {
  const started = async () => {
    const mod = await load();
    const log = logger();
    const reporter = await mod.initErrorReporting(config(), log);
    return { reporter, log, ...mod };
  };

  it('passes the error and its context to the SDK as tags, an opaque user and a level', async () => {
    const { reporter } = await started();
    const error = new Error('db down');

    reporter.capture(error, {
      tags: { source: 'http', status: 500, route: '/orders/:id', tenant_id: undefined },
      userId: 'user-1',
      level: 'fatal',
    });

    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      tags: { source: 'http', status: '500', route: '/orders/:id' },
      user: { id: 'user-1' },
      level: 'fatal',
    });
  });

  it('sends no user when there is no id', async () => {
    const { reporter } = await started();
    reporter.capture(new Error('x'), { tags: { a: 'b' }, userId: null });
    reporter.capture(new Error('x'), { userId: '' });
    for (const call of sdk.captureException.mock.calls) {
      expect(call[1]).not.toHaveProperty('user');
    }
  });

  it('reports a bare error without any context', async () => {
    const { reporter } = await started();
    const error = new Error('x');
    reporter.capture(error);
    expect(sdk.captureException).toHaveBeenCalledWith(error, undefined);
  });

  it('never throws, whatever the SDK does', async () => {
    const { reporter, log } = await started();
    sdk.captureException.mockImplementation(() => {
      throw new Error('transport exploded');
    });

    expect(() => reporter.capture(new Error('x'), { tags: { a: 'b' } })).not.toThrow();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('holds back events beyond a cap per minute, never a fatal one, and says so once the minute is over', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const { reporter, log, MAX_EVENTS_PER_MINUTE } = await started();

    // An outage: every request is a 500.
    for (let i = 0; i < MAX_EVENTS_PER_MINUTE + 25; i += 1)
      reporter.capture(new Error(`down ${i}`));
    expect(sdk.captureException).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE);
    // The first events are the ones that say what broke.
    expect(sdk.captureException.mock.calls[0]?.[0]).toHaveProperty('message', 'down 0');

    // The process dying is always sent.
    reporter.capture(new Error('fatal'), { level: 'fatal' });
    expect(sdk.captureException).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE + 1);
    expect(log.warn).not.toHaveBeenCalled();

    // A minute later the window is new, and the log says how many were held back.
    vi.setSystemTime(new Date('2026-10-10T10:01:01Z'));
    reporter.capture(new Error('after'));
    expect(sdk.captureException).toHaveBeenCalledTimes(MAX_EVENTS_PER_MINUTE + 2);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith({ dropped: 25 }, expect.any(String));
  });

  it('reportError builds the context lazily, inside its guard, and not at all for the no-op reporter', async () => {
    const { reportError, noopErrorReporter } = await load();
    const context = vi.fn(() => ({ tags: { a: 'b' } }));

    reportError(new Error('x'), context, noopErrorReporter);
    expect(context).not.toHaveBeenCalled();

    const capture = vi.fn();
    reportError(new Error('x'), context, { capture, flush: async () => true });
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { tags: { a: 'b' } });

    // A context that cannot be built is a lost report, not an exception for the caller.
    expect(() =>
      reportError(
        new Error('x'),
        () => {
          throw new Error('cannot read the request');
        },
        { capture, flush: async () => true },
      ),
    ).not.toThrow();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reportError swallows a reporter that throws and uses the process reporter by default', async () => {
    const { reportError, setErrorReporter } = await load();
    const throwing = {
      capture: vi.fn(() => {
        throw new Error('boom');
      }),
      flush: vi.fn(),
    };
    expect(() => reportError(new Error('x'), undefined, throwing)).not.toThrow();
    expect(throwing.capture).toHaveBeenCalledTimes(1);

    const ours = { capture: vi.fn(), flush: vi.fn() };
    setErrorReporter(ours);
    const error = new Error('y');
    reportError(error, { tags: { a: 'b' } });
    expect(ours.capture).toHaveBeenCalledWith(error, { tags: { a: 'b' } });
  });
});

describe('flushing', () => {
  const started = async () => {
    const mod = await load();
    const reporter = await mod.initErrorReporting(config(), logger());
    return { reporter, ...mod };
  };

  it('passes the time limit to the SDK and reports whether everything was sent', async () => {
    const { reporter } = await started();
    expect(await reporter.flush(1500)).toBe(true);
    expect(sdk.flush).toHaveBeenCalledWith(1500);

    sdk.flush.mockResolvedValue(false);
    expect(await reporter.flush(1500)).toBe(false);
  });

  it('gives up at the time limit even if the SDK never answers', async () => {
    const { reporter } = await started();
    sdk.flush.mockReturnValue(new Promise(() => undefined));
    const begun = Date.now();

    expect(await reporter.flush(40)).toBe(false);

    expect(Date.now() - begun).toBeLessThan(2000);
  });

  it('never rejects', async () => {
    const { reporter } = await started();
    sdk.flush.mockRejectedValue(new Error('network'));
    expect(await reporter.flush(40)).toBe(false);
  });

  it('is capped at two seconds at shutdown', async () => {
    vi.useFakeTimers();
    const { reporter, errorReportingShutdownTarget, SHUTDOWN_FLUSH_MS } = await started();
    sdk.flush.mockReturnValue(new Promise(() => undefined));
    let closed = false;

    const closing = errorReportingShutdownTarget(reporter)
      .close()
      .then(() => {
        closed = true;
      });

    expect(SHUTDOWN_FLUSH_MS).toBe(2000);
    expect(sdk.flush).toHaveBeenCalledWith(2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(closed).toBe(true);
  });
});
