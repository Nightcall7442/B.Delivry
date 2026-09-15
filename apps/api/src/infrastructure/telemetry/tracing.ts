/**
 * OpenTelemetry SDK init (OTLP → Jaeger).
 */
import type { ObservabilityConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';

export interface Tracing {
  shutdown(): Promise<void>;
}

const noop: Tracing = { shutdown: async () => undefined };

/**
 * The OTel SDK must patch http/pg/ioredis before they are imported, so this is
 * called first thing in main.ts. It is a dynamic import so the SDK packages
 * stay optional: with OTEL_ENABLED=false the API runs without them installed.
 */
export async function initTracing(config: ObservabilityConfig, logger: Logger): Promise<Tracing> {
  if (!config.otelEnabled) return noop;

  try {
    // Loaded through a variable so TypeScript does not require the packages to
    // be installed: they are genuinely optional, and the catch below is the
    // supported path when they are absent.
    const load = (specifier: string): Promise<Record<string, unknown>> =>
      import(specifier) as Promise<Record<string, unknown>>;

    const [sdkModule, instrumentationsModule, exporterModule] = await Promise.all([
      load('@opentelemetry/sdk-node'),
      load('@opentelemetry/auto-instrumentations-node'),
      load('@opentelemetry/exporter-trace-otlp-http'),
    ]);

    const NodeSDK = sdkModule.NodeSDK as new (options: unknown) => {
      start(): void;
      shutdown(): Promise<void>;
    };
    const getNodeAutoInstrumentations = instrumentationsModule.getNodeAutoInstrumentations as (
      options: unknown,
    ) => unknown[];
    const OTLPTraceExporter = exporterModule.OTLPTraceExporter as new (options: {
      url: string;
    }) => unknown;

    const sdk = new NodeSDK({
      serviceName: config.serviceName,
      traceExporter: new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Health and metrics scrapes would otherwise be most of the traces.
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    logger.info({ endpoint: config.otlpEndpoint }, 'tracing started');
    return { shutdown: () => sdk.shutdown() };
  } catch (error) {
    // Missing SDK packages must not stop the API from serving orders.
    logger.warn({ err: error }, 'tracing disabled: OpenTelemetry SDK unavailable');
    return noop;
  }
}
