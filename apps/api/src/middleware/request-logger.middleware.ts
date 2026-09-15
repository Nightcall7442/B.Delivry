/**
 * Structured request logging.
 */
import type { FastifyInstance } from 'fastify';
import type { ObservabilityConfig } from '../config/index.js';
import { httpRequestDuration } from '../infrastructure/telemetry/metrics.js';

/**
 * One line per finished request, plus the latency histogram. Health checks and
 * metric scrapes are skipped: they run every few seconds and would be most of
 * the log volume while telling nobody anything.
 */
export function registerRequestLogger(app: FastifyInstance, config: ObservabilityConfig): void {
  const ignored = new Set(config.ignoredPaths);

  app.addHook('onResponse', async (request, reply) => {
    if (ignored.has(request.url)) return;

    // The route template, not the URL: /orders/:id keeps the metric to one
    // series instead of one per order.
    const route = request.routeOptions.url ?? 'unknown';
    const durationSeconds = reply.elapsedTime / 1000;

    httpRequestDuration
      .labels(request.method, route, String(reply.statusCode))
      .observe(durationSeconds);

    request.log.info(
      {
        method: request.method,
        route,
        url: request.url,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        userId: request.user?.id,
        tenantId: request.ctx?.tenantId,
        ip: request.ip,
      },
      'request completed',
    );
  });
}
