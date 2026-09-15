/**
 * /health, /ready, /metrics.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { checkLiveness, checkReadiness } from '../infrastructure/health/index.js';
import { metricsContentType, renderMetrics } from '../infrastructure/telemetry/metrics.js';

const VERSION = process.env.npm_package_version ?? '0.0.1';

/**
 * Mounted outside the API prefix and outside auth: a load balancer cannot send
 * a bearer token, and a probe that needs the database to answer would take the
 * whole service out during a brief database blip.
 */
export function healthRoutes(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    // Liveness: is this process running. Never touches a dependency.
    app.get('/health', async () => checkLiveness(VERSION));

    // Readiness: can it serve traffic. The database is required; Redis is not.
    app.get('/ready', async (_request, reply) => {
      if (container.redis === null) {
        return reply.send(checkLiveness(VERSION));
      }

      const report = await checkReadiness({
        prisma: container.prisma,
        redis: container.redis,
        version: VERSION,
      });

      return reply.code(report.status === 'up' ? 200 : 503).send(report);
    });

    app.get(container.config.observability.metricsPath, async (_request, reply) => {
      void reply.header('content-type', metricsContentType);
      return reply.send(await renderMetrics());
    });
  };
}
