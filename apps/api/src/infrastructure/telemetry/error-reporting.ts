/**
 * Error reporting (Sentry): errors only, off unless SENTRY_DSN is set.
 *
 * Without a DSN this file never loads the SDK: `@sentry/node` is a dynamic import inside
 * `initErrorReporting`, behind the DSN check, exactly as tracing.ts treats OpenTelemetry. The
 * API then runs as it always has: no import, no init, no network, no listener on `process`.
 *
 * What is reported is decided by the callers (error handler: 5xx only; queue: jobs out of
 * attempts; process: the fatal exits). What leaves the process is decided here and in
 * error-event.ts: the event is cut down and every string in it is masked.
 */
import type { ExclusiveEventHintOrCaptureContext, NodeOptions } from '@sentry/node';
import type { ErrorReportingConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';
import { sanitizeEvent } from './error-event.js';

/** Everything a report may say about where it came from. Tags are searchable in Sentry. */
export interface ErrorContext {
  /**
   * Short, non-secret facts: request id, route pattern, status, job name. Undefined values are
   * dropped. Never a body, a header or a query string: they would be masked, not removed.
   */
  tags?: Record<string, string | number | undefined>;
  /** An opaque user id, never a phone, an e-mail or a name. */
  userId?: string | null;
  level?: 'error' | 'fatal';
}

export interface ErrorReporter {
  /** Fire and forget. Never throws: a reporter that fails must not change what the caller does. */
  capture(error: unknown, context?: ErrorContext): void;
  /** Resolves true when everything was sent, false when time ran out. Never rejects. */
  flush(timeoutMs: number): Promise<boolean>;
}

/** Events the API sends per minute, fatal ones aside. A few dozen is plenty to read; a flood is an outage. */
export const MAX_EVENTS_PER_MINUTE = 30;

/** What the SDK gets at shutdown. The process is leaving: a slow Sentry must not hold it. */
export const SHUTDOWN_FLUSH_MS = 2000;

/** The reporter of a process without a DSN: nothing is loaded and nothing happens. */
export const noopErrorReporter: ErrorReporter = {
  capture: () => undefined,
  flush: async () => true,
};

// One reporter per process, like the SDK itself. The container is built before the SDK starts (it
// owns the logger the SDK needs), and the error handler and the queue workers are built from it,
// so they ask for the reporter when an error happens rather than being handed one at build time.
let current: ErrorReporter = noopErrorReporter;

export const getErrorReporter = (): ErrorReporter => current;

export function setErrorReporter(reporter: ErrorReporter): void {
  current = reporter;
}

/**
 * Reports through `reporter` (default: the process's) and swallows anything it throws. The one
 * call the rest of the API makes: an error handler that fails while reporting is worse than a
 * report that was lost.
 */
export function reportError(
  error: unknown,
  context?: ErrorContext | (() => ErrorContext),
  reporter: ErrorReporter = current,
): void {
  // Without a DSN nothing is built: the context of a request is not read for a reporter that drops it.
  if (reporter === noopErrorReporter) return;
  try {
    // A context built from a request is built here, inside the guard: reading it must not be able
    // to change what the caller does next (the error handler still has to answer).
    reporter.capture(error, typeof context === 'function' ? context() : context);
  } catch {
    // Best effort by design.
  }
}

/** For `registerShutdown`: the last thing closed, so errors during teardown are still sent. */
export function errorReportingShutdownTarget(reporter: ErrorReporter): {
  close(): Promise<void>;
} {
  return {
    close: async () => {
      await reporter.flush(SHUTDOWN_FLUSH_MS);
    },
  };
}

/** `https://<key>@<host>/<numeric project id>`: the shape the SDK accepts, checked before it is asked. */
export function isValidDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split('/').filter(Boolean).pop() ?? '';
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username !== '' &&
      url.hostname !== '' &&
      /^\d+$/.test(projectId)
    );
  } catch {
    return false;
  }
}

/** The part of the SDK this file uses. */
type SentryModule = Pick<
  typeof import('@sentry/node'),
  | 'init'
  | 'captureException'
  | 'flush'
  | 'eventFiltersIntegration'
  | 'functionToStringIntegration'
  | 'linkedErrorsIntegration'
  | 'contextLinesIntegration'
  | 'nodeContextIntegration'
  | 'systemErrorIntegration'
>;

/**
 * The SDK's options: errors, and nothing else.
 *
 * Integrations are listed, not inherited. The SDK's defaults would also: record every outgoing
 * request as a breadcrumb (the Telegram bot token is part of that URL), copy console output,
 * attach local variables, send session health, and patch http/fetch. The six kept here are the
 * ones a report is useful with: the cause chain, the source around a frame, node/os versions,
 * the details of a system error. New integrations a future SDK adds to its defaults stay off.
 *
 * Process-level handlers are NOT among them. Today `registerShutdown` owns `unhandledRejection`
 * and `uncaughtException`: log, close everything in order, exit 0 (app/shutdown.ts). The SDK's
 * own versions change that: its rejection handler (mode `warn`) replaces Node's crash-on-
 * rejection while no handler of ours exists yet (boot), and its exception handler exits 1 after
 * its own flush whenever it is the only listener (also boot). Instead of tuning them to match,
 * they are not installed, and shutdown.ts reports from the handlers it already has, so the API
 * exits exactly as before and still reports why.
 */
export function buildSentryOptions(
  sentry: SentryModule,
  config: ErrorReportingConfig & { dsn: string },
): NodeOptions {
  return {
    dsn: config.dsn,
    environment: config.environment,
    ...(config.release !== undefined ? { release: config.release } : {}),
    // No tracesSampleRate/tracesSampler, no profiles: errors only. (The SDK reads
    // SENTRY_TRACES_SAMPLE_RATE from the environment when the option is missing; nothing in our
    // integration list records a span, so that variable would send nothing.) Logs and metrics are
    // ON by default in this SDK version, hence the explicit false.
    enableLogs: false,
    enableMetrics: false,
    sendDefaultPii: false,
    initialScope: { tags: { service: 'api' } },
    beforeSend: sanitizeEvent,
    defaultIntegrations: [
      sentry.eventFiltersIntegration(),
      sentry.functionToStringIntegration(),
      sentry.linkedErrorsIntegration(),
      sentry.contextLinesIntegration(),
      sentry.nodeContextIntegration(),
      sentry.systemErrorIntegration(),
    ],
    // Nothing records breadcrumbs; this keeps it that way.
    maxBreadcrumbs: 0,
    // Client reports are a timer and an exit hook that send counts of dropped events: not errors.
    sendClientReports: false,
    // The loader hooks exist to patch libraries for tracing, and wrap every module imported after.
    registerEsmLoaderHooks: false,
    // Without spans there is nothing for the SDK's OpenTelemetry to do, and initTracing (off by
    // default) owns the OpenTelemetry globals when it is on: a second registration would fight it.
    skipOpenTelemetrySetup: true,
  };
}

const toCaptureContext = (context: ErrorContext): ExclusiveEventHintOrCaptureContext => {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.tags ?? {})) {
    if (value !== undefined) tags[key] = String(value);
  }
  return {
    tags,
    ...(context.userId != null && context.userId !== '' ? { user: { id: context.userId } } : {}),
    ...(context.level !== undefined ? { level: context.level } : {}),
  };
};

class SentryErrorReporter implements ErrorReporter {
  constructor(
    private readonly sentry: SentryModule,
    private readonly logger: Logger,
  ) {}

  /** Events let through in the current minute, and how many were held back (see MAX_EVENTS_PER_MINUTE). */
  private windowStart = 0;
  private sent = 0;
  private dropped = 0;

  capture(error: unknown, context?: ErrorContext): void {
    if (!this.admit(context?.level)) return;
    try {
      this.sentry.captureException(
        error,
        context === undefined ? undefined : toCaptureContext(context),
      );
    } catch (failure) {
      // Reporting is a side channel: log it and carry on.
      this.logger.warn({ err: failure }, 'error report could not be queued');
    }
  }

  /**
   * An outage turns every request into a 500 and every 500 into an event: the quota would be gone in
   * minutes and the shutdown flush would queue behind them. So a cap per minute; the first events of an
   * outage are the ones that say what broke. Fatal events (the process is dying) are never held back.
   */
  private admit(level: ErrorContext['level']): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      if (this.dropped > 0) {
        this.logger.warn({ dropped: this.dropped }, 'error reports held back in the last minute');
      }
      this.windowStart = now;
      this.sent = 0;
      this.dropped = 0;
    }
    if (level === 'fatal') return true;
    if (this.sent >= MAX_EVENTS_PER_MINUTE) {
      this.dropped += 1;
      return false;
    }
    this.sent += 1;
    return true;
  }

  async flush(timeoutMs: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    // The SDK honours the timeout it is given; the cap is for the day it does not.
    const cap = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([this.sentry.flush(timeoutMs), cap]);
    } catch (failure) {
      this.logger.warn({ err: failure }, 'error reports could not be flushed');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Starts error reporting and returns the reporter. Never throws and never blocks the boot:
 * a missing or malformed DSN, or an SDK that will not start, leaves the API running without it.
 */
export async function initErrorReporting(
  config: ErrorReportingConfig,
  logger: Logger,
): Promise<ErrorReporter> {
  const { dsn } = config;
  if (dsn === undefined) return noopErrorReporter;

  if (!isValidDsn(dsn)) {
    // The value itself stays out of the log: it is a credential of sorts, and it is wrong anyway.
    logger.warn('SENTRY_DSN is set but is not a Sentry DSN; error reporting is off');
    return noopErrorReporter;
  }

  try {
    const sentry = await import('@sentry/node');
    sentry.init(buildSentryOptions(sentry, { ...config, dsn }));
    logger.info(
      { environment: config.environment, release: config.release },
      'error reporting started',
    );
    return new SentryErrorReporter(sentry, logger);
  } catch (error) {
    logger.warn({ err: error }, 'error reporting disabled: the Sentry SDK did not start');
    return noopErrorReporter;
  }
}
