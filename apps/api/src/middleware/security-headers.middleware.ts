/**
 * Helmet-like secure headers, CORS, CSRF strategy.
 */
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { SecurityConfig } from '../config/index.js';
import { TENANT_HEADER } from './tenant.middleware.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

/**
 * CSRF is not defended against with tokens here, on purpose: this API accepts
 * credentials only as a Bearer header, never as a cookie, so a cross-site form
 * post cannot carry authentication. Adding cookie auth later means adding CSRF
 * protection in the same change.
 */
export async function registerSecurityHeaders(
  app: FastifyInstance,
  config: SecurityConfig,
): Promise<void> {
  await app.register(helmet, {
    // The API serves JSON, not documents; a strict CSP costs nothing here.
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Same-origin and native app requests arrive without an Origin header.
      if (origin === undefined) {
        callback(null, true);
        return;
      }
      callback(null, config.corsOrigins.includes(origin));
    },
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', TENANT_HEADER, REQUEST_ID_HEADER, 'x-locale'],
    exposedHeaders: [REQUEST_ID_HEADER, 'x-ratelimit-remaining', 'retry-after'],
    maxAge: 86_400,
  });
}
