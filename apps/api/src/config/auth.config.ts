/**
 * Auth configuration slice.
 */
import { parseDuration } from '@bazar/utils';
import type { Env } from './env.schema.js';

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  sessionSecret: string;
  /** Seconds, parsed once from the human "15m" / "30d" form. */
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  passwordHashRounds: number;
  otpTtlSeconds: number;
  otpLength: number;
  issuer: string;
  audience: string;
}

export function buildAuthConfig(env: Env): AuthConfig {
  return {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    sessionSecret: env.SESSION_SECRET,
    accessTtlSeconds: parseDuration(env.JWT_ACCESS_TTL),
    refreshTtlSeconds: parseDuration(env.JWT_REFRESH_TTL),
    passwordHashRounds: env.PASSWORD_HASH_ROUNDS,
    otpTtlSeconds: env.OTP_TTL_SECONDS,
    otpLength: env.OTP_LENGTH,
    issuer: env.APP_NAME,
    audience: env.API_BASE_URL,
  };
}
