/**
 * Builds the HTTP application: middleware → routes → websocket → error handler.
 */
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerRoutes } from '../routes/index.js';
import { registerWebsocket } from '../websocket/index.js';
import {
  registerAuditLog,
  registerAuth,
  registerErrorHandler,
  registerLocale,
  registerNotFound,
  registerRateLimit,
  registerRequestId,
  registerRequestLogger,
  registerSanitize,
  registerSecurityHeaders,
  registerTenantResolution,
} from '../middleware/index.js';
import { prismaTenantLookup } from '../common/tenant/tenant-resolver.js';
import type { Container } from './container.js';

/**
 * Hook order is the design here, and it is not arbitrary:
 *
 *   requestId  - so every later line can be traced
 *   locale     - cheap, and the error handler wants it
 *   auth       - the token decides the tenant, so it runs before tenant
 *   rateLimit  - after auth, so limits are per account and not per office IP
 *   tenant     - opens the AsyncLocalStorage scope the rest of the app runs in
 *   sanitize   - preValidation, before any schema sees the values
 *   routes     - everything below this point has a context
 */
export async function createApp(container: Container): Promise<FastifyInstance> {
  const { config, logger } = container;

  const app = Fastify({
    // pino's Logger and Fastify's FastifyBaseLogger disagree on `msgPrefix`
    // under exactOptionalPropertyTypes. They are the same object at runtime;
    // widening here keeps every hook and route typed against the standard
    // FastifyInstance instead of a pino-parameterized one.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    trustProxy: config.security.trustProxy,
    bodyLimit: config.security.bodyLimitBytes,
    // Fastify generates its own ids; ours comes from the header when present.
    genReqId: () => crypto.randomUUID(),
    disableRequestLogging: true,
  });

  await registerSecurityHeaders(app, config.security);

  registerRequestId(app);
  registerLocale(app);
  registerAuth(app, container.services.tokens);
  registerRateLimit(app, container.limiter, config.security);
  registerTenantResolution(app, prismaTenantLookup(container.prisma, container.cache));
  registerSanitize(app);
  registerRequestLogger(app, config.observability);
  registerAuditLog(app, container.services.audit);

  registerErrorHandler(app);
  registerNotFound(app);

  await registerRoutes(app, container);
  await registerWebsocket(app, container);

  return app;
}
