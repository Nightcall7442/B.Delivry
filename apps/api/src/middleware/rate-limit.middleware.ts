/**
 * Rate limiting via infrastructure/redis/rate-limiter.
 */
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { SecurityConfig } from '../config/index.js';
import type { RateLimiter } from '../infrastructure/redis/rate-limiter.js';
import { RateLimitedError } from '../common/errors/domain.errors.js';

/**
 * A signed-in user is limited per account, so sharing an office IP does not
 * make colleagues limit each other. Anonymous traffic falls back to the IP,
 * which is all there is to go on.
 */
function bucketFor(request: FastifyRequest, scope: string): string {
  const identity = request.user?.id ?? request.ip;
  return `${scope}:${identity}`;
}

export function registerRateLimit(
  app: FastifyInstance,
  limiter: RateLimiter,
  config: SecurityConfig,
): void {
  app.addHook('onRequest', async (request, reply) => {
    const result = await limiter.consume(
      bucketFor(request, 'global'),
      config.rateLimit.max,
      config.rateLimit.windowMs,
    );

    void reply.header('x-ratelimit-limit', config.rateLimit.max);
    void reply.header('x-ratelimit-remaining', result.remaining);

    if (!result.allowed) throw new RateLimitedError(result.retryAfter);
  });
}

/**
 * Tighter budget for anything that sends an SMS or checks a credential.
 * Attach to auth routes: `preHandler: [strictRateLimit(limiter, config, 'otp')]`.
 */
export function strictRateLimit(
  limiter: RateLimiter,
  config: SecurityConfig,
  scope: string,
): preHandlerHookHandler {
  return async (request) => {
    const result = await limiter.consume(
      bucketFor(request, scope),
      config.rateLimit.authMax,
      config.rateLimit.windowMs,
    );
    if (!result.allowed) throw new RateLimitedError(result.retryAfter);
  };
}

/** Limits by a value from the body (a phone number), not by who is asking. */
export function keyedRateLimit(
  limiter: RateLimiter,
  scope: string,
  limit: number,
  windowMs: number,
  keyOf: (request: FastifyRequest) => string | undefined,
): preHandlerHookHandler {
  return async (request) => {
    const value = keyOf(request);
    if (value === undefined) return;
    const result = await limiter.consume(`${scope}:${value}`, limit, windowMs);
    if (!result.allowed) throw new RateLimitedError(result.retryAfter);
  };
}
