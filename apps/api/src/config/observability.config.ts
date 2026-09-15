/**
 * Observability configuration slice.
 */
import type { Env } from './env.schema.js';

export interface ObservabilityConfig {
  otelEnabled: boolean;
  serviceName: string;
  otlpEndpoint: string;
  metricsPath: string;
  /** Paths kept out of the access log and the latency histogram. */
  ignoredPaths: string[];
}

export function buildObservabilityConfig(env: Env): ObservabilityConfig {
  return {
    otelEnabled: env.OTEL_ENABLED,
    serviceName: env.OTEL_SERVICE_NAME,
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    metricsPath: env.PROMETHEUS_METRICS_PATH,
    ignoredPaths: ['/health', '/ready', env.PROMETHEUS_METRICS_PATH],
  };
}
