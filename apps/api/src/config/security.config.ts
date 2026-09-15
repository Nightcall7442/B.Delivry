/**
 * Security configuration slice.
 */
import type { Env } from './env.schema.js';

export interface SecurityConfig {
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
    /** Auth endpoints get a much tighter budget than the rest of the API. */
    authMax: number;
  };
  /** Trust X-Forwarded-For only behind our own proxy, or client IPs can be faked. */
  trustProxy: boolean;
  bodyLimitBytes: number;
}

export function buildSecurityConfig(env: Env): SecurityConfig {
  return {
    corsOrigins: env.CORS_ORIGINS,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      authMax: Math.max(5, Math.floor(env.RATE_LIMIT_MAX / 10)),
    },
    trustProxy: env.NODE_ENV === 'production',
    bodyLimitBytes: 1024 * 1024,
  };
}
