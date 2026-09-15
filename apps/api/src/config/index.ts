/**
 * Typed, validated runtime configuration (single source of truth for process.env).
 */
import { envSchema, type Env } from './env.schema.js';
import { buildAppConfig, type AppConfig } from './app.config.js';
import { buildAuthConfig, type AuthConfig } from './auth.config.js';
import { buildDatabaseConfig, type DatabaseConfig } from './database.config.js';
import { buildMapsConfig, type MapsConfig } from './maps.config.js';
import { buildNotificationsConfig, type NotificationsConfig } from './notifications.config.js';
import { buildObservabilityConfig, type ObservabilityConfig } from './observability.config.js';
import { buildPaymentsConfig, type PaymentsConfig } from './payments.config.js';
import { buildRedisConfig, type RedisConfig } from './redis.config.js';
import { buildSecurityConfig, type SecurityConfig } from './security.config.js';
import { buildStorageConfig, type StorageConfig } from './storage.config.js';

export interface Config {
  app: AppConfig;
  auth: AuthConfig;
  database: DatabaseConfig;
  maps: MapsConfig;
  notifications: NotificationsConfig;
  observability: ObservabilityConfig;
  payments: PaymentsConfig;
  redis: RedisConfig;
  security: SecurityConfig;
  storage: StorageConfig;
}

/**
 * Nothing else in the codebase reads process.env. Validation happens once, at
 * boot, and a bad value kills the process there rather than surfacing as an
 * undefined three layers deep during a delivery.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  // A copied .env.example leaves optional keys as `KEY=`; an empty string is
  // "not set", not an invalid URL.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return buildConfig(parsed.data);
}

function buildConfig(env: Env): Config {
  return {
    app: buildAppConfig(env),
    auth: buildAuthConfig(env),
    database: buildDatabaseConfig(env),
    maps: buildMapsConfig(env),
    notifications: buildNotificationsConfig(env),
    observability: buildObservabilityConfig(env),
    payments: buildPaymentsConfig(env),
    redis: buildRedisConfig(env),
    security: buildSecurityConfig(env),
    storage: buildStorageConfig(env),
  };
}

let cached: Config | null = null;

/** Memoized accessor for code that cannot take config as an argument. */
export function config(): Config {
  cached ??= loadConfig();
  return cached;
}

/** Tests build their own config and inject it; this resets the memo. */
export function setConfig(next: Config | null): void {
  cached = next;
}

export type { Env };
export { envSchema } from './env.schema.js';
export type { AppConfig } from './app.config.js';
export type { AuthConfig } from './auth.config.js';
export type { DatabaseConfig } from './database.config.js';
export type { MapsConfig } from './maps.config.js';
export type { NotificationsConfig } from './notifications.config.js';
export type { ObservabilityConfig } from './observability.config.js';
export type { PaymentsConfig } from './payments.config.js';
export type { RedisConfig } from './redis.config.js';
export type { SecurityConfig } from './security.config.js';
export type { StorageConfig, StorageFolder } from './storage.config.js';
export { STORAGE_FOLDER } from './storage.config.js';
