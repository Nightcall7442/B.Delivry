/**
 * Auth route definitions — mounted by src/routes/auth.routes.ts.
 */
import { LIMITS } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import type { SecurityConfig } from '../../../config/index.js';
import type { RateLimiter } from '../../../infrastructure/redis/rate-limiter.js';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { keyedRateLimit, strictRateLimit } from '../../../middleware/rate-limit.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { AuthController } from '../controller/auth.controller.js';
import { loginSchema, refreshSchema, requestOtpSchema, verifyOtpSchema } from '../schemas/index.js';

export interface AuthRouteDeps {
  controller: AuthController;
  limiter: RateLimiter;
  security: SecurityConfig;
}

export function authRoutes({ controller, limiter, security }: AuthRouteDeps) {
  return async (app: FastifyInstance): Promise<void> => {
    /**
     * These endpoints are the front door: unauthenticated, and each one either
     * spends money (SMS) or checks a credential. They carry their own limits
     * keyed on the phone number, so one attacker cannot burn another user's
     * quota by rotating IPs.
     */
    const phoneKey = (request: { body?: unknown }): string | undefined =>
      (request.body as { phone?: string } | undefined)?.phone;

    app.post(
      '/otp/request',
      {
        preHandler: [
          validate({ body: requestOtpSchema }),
          keyedRateLimit(limiter, 'otp-request', LIMITS.OTP_MAX_PER_DAY, 86_400_000, phoneKey),
          strictRateLimit(limiter, security, 'otp-request-ip'),
        ],
      },
      controller.requestOtp,
    );

    app.post(
      '/otp/verify',
      {
        preHandler: [
          validate({ body: verifyOtpSchema }),
          keyedRateLimit(limiter, 'otp-verify', LIMITS.OTP_MAX_ATTEMPTS * 3, 3_600_000, phoneKey),
        ],
      },
      controller.verifyOtp,
    );

    app.post(
      '/login',
      {
        preHandler: [
          validate({ body: loginSchema }),
          keyedRateLimit(limiter, 'login', LIMITS.LOGIN_MAX_FAILURES, 900_000, phoneKey),
        ],
      },
      controller.login,
    );

    app.post('/refresh', { preHandler: validate({ body: refreshSchema }) }, controller.refresh);

    app.post('/logout', { preHandler: requireAuth }, controller.logout);
    app.post('/logout-all', { preHandler: requireAuth }, controller.logoutAll);
    app.get('/sessions', { preHandler: requireAuth }, controller.sessions);
  };
}
