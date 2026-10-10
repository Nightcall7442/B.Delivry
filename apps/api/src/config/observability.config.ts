/**
 * Observability configuration slice.
 */
import type { Env } from './env.schema.js';

/** What `initErrorReporting` needs; the DSN is checked there, not here (see env.schema.ts). */
export interface ErrorReportingConfig {
  /** Unset = error reporting is off: nothing is loaded, initialised or sent. */
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
}

export interface ObservabilityConfig {
  otelEnabled: boolean;
  serviceName: string;
  otlpEndpoint: string;
  metricsPath: string;
  /** Paths kept out of the access log and the latency histogram. */
  ignoredPaths: string[];
  errorReporting: ErrorReportingConfig;
}

export function buildObservabilityConfig(env: Env): ObservabilityConfig {
  return {
    otelEnabled: env.OTEL_ENABLED,
    serviceName: env.OTEL_SERVICE_NAME,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    metricsPath: env.PROMETHEUS_METRICS_PATH,
    ignoredPaths: ['/health', '/ready', env.PROMETHEUS_METRICS_PATH],
    errorReporting: {
      dsn: env.SENTRY_DSN?.trim(),
      // APP_ENV defaults to 'local': a production service that only sets the DSN must not report as a laptop.
      environment:
        env.SENTRY_ENVIRONMENT?.trim() ??
        (env.NODE_ENV === 'production' && env.APP_ENV === 'local' ? 'production' : env.APP_ENV),
      release: env.SENTRY_RELEASE?.trim() ?? env.RAILWAY_GIT_COMMIT_SHA?.trim(),
    },
  };
}
