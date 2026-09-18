/**
 * Zod schema for all environment variables (mirrors .env.example sections).
 */
import { SUPPORTED_LOCALES } from '@bazar/constants';
import { z } from 'zod';

/** Env is always strings: booleans and numbers are coerced, never trusted raw. */
const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');

const csv = <T extends string>(values: readonly T[]) =>
  z.string().transform((raw, ctx) => {
    const parsed = raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const invalid = parsed.filter((item) => !(values as readonly string[]).includes(item));
    if (invalid.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unsupported: ${invalid.join(', ')}` });
      return z.NEVER;
    }
    return parsed as T[];
  });

const list = z.string().transform((raw) =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);

/**
 * Secrets must be long enough to be worth having. A short JWT secret is the
 * single cheapest way to lose every account, so it fails startup, not a review.
 */
const secret = z.string().min(32, 'Secret must be at least 32 characters');

export const envSchema = z
  .object({
    // ---------------------------------------------------------------- APP
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().default('bazar-delivery'),
    APP_ENV: z.string().default('local'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_HOST: z.string().default('0.0.0.0'),
    API_BASE_URL: z.string().url().default('http://localhost:4000'),
    API_PREFIX: z.string().startsWith('/').default('/api/v1'),
    WEB_URL: z.string().url().default('http://localhost:3000'),
    ADMIN_URL: z.string().url().default('http://localhost:3001'),
    CORS_ORIGINS: list.default(
      'http://localhost:3000,http://localhost:3001,http://localhost:8081,http://localhost:8082,http://localhost:8083,http://localhost:8084,http://localhost:5173',
    ),
    DEFAULT_LOCALE: z.enum(SUPPORTED_LOCALES).default('uz'),
    SUPPORTED_LOCALES: csv(SUPPORTED_LOCALES).default('uz,ru,en'),
    DEFAULT_CURRENCY: z.string().length(3).default('UZS'),
    DEFAULT_COUNTRY_CODE: z.string().length(2).default('UZ'),
    DEFAULT_PHONE_PREFIX: z.string().default('+998'),
    DEFAULT_TIMEZONE: z.string().default('Asia/Tashkent'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // ---------------------------------------------------------------- DATABASE
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

    // ---------------------------------------------------------------- REDIS
    // Unset = no Redis: the container falls back to its in-memory twins.
    REDIS_URL: z.string().url().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).default(0),
    REDIS_KEY_PREFIX: z.string().default('bazar:'),

    // ---------------------------------------------------------------- AUTH
    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_SECRET: secret,
    JWT_REFRESH_TTL: z.string().default('30d'),
    SESSION_SECRET: secret,
    PASSWORD_HASH_ROUNDS: z.coerce.number().int().min(10).max(20).default(12),
    OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),

    // ---------------------------------------------------------------- STORAGE
    STORAGE_PROVIDER: z.enum(['s3', 'local']).default('local'),
    STORAGE_BUCKET: z.string().default('bazar-delivery-dev'),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_PUBLIC_URL: z.string().url().optional(),

    // ---------------------------------------------------------------- MAPS
    MAPS_PROVIDER: z.enum(['google', 'yandex', '2gis', 'osm']).default('osm'),
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    YANDEX_MAPS_API_KEY: z.string().optional(),
    DGIS_API_KEY: z.string().optional(),
    OSRM_BASE_URL: z.string().url().default('http://localhost:5000'),

    // ---------------------------------------------------------------- PAYMENTS
    PAYMENTS_DEFAULT_PROVIDER: z
      .enum(['cash', 'payme', 'click', 'uzum', 'balance'])
      .default('cash'),
    PAYME_MERCHANT_ID: z.string().optional(),
    PAYME_SECRET_KEY: z.string().optional(),
    PAYME_CALLBACK_URL: z.string().url().optional(),
    /** https://checkout.test.paycom.uz while on the sandbox. */
    PAYME_CHECKOUT_URL: z.string().url().optional(),
    CLICK_MERCHANT_ID: z.string().optional(),
    CLICK_SERVICE_ID: z.string().optional(),
    CLICK_SECRET_KEY: z.string().optional(),
    UZUM_MERCHANT_ID: z.string().optional(),
    UZUM_SECRET_KEY: z.string().optional(),

    // ---------------------------------------------------------------- SMS
    SMS_PROVIDER: z.enum(['eskiz', 'playmobile', 'console']).default('console'),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_FROM: z.string().default('4546'),
    PLAYMOBILE_LOGIN: z.string().optional(),
    PLAYMOBILE_PASSWORD: z.string().optional(),

    // ---------------------------------------------------------------- TELEGRAM
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    // Without the @username the app cannot build the t.me deep link.
    TELEGRAM_BOT_USERNAME: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    TELEGRAM_SUPPORT_CHAT_ID: z.string().optional(),

    // ---------------------------------------------------------------- PUSH
    PUSH_PROVIDER: z.enum(['expo', 'fcm']).default('expo'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),

    // ---------------------------------------------------------------- EMAIL
    EMAIL_PROVIDER: z.enum(['console', 'smtp', 'resend']).default('console'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().email().default('no-reply@example.com'),

    // ---------------------------------------------------------------- OBSERVABILITY
    OTEL_ENABLED: bool(false),
    OTEL_SERVICE_NAME: z.string().default('bazar-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
    PROMETHEUS_METRICS_PATH: z.string().startsWith('/').default('/metrics'),
  })
  .superRefine((env, ctx) => {
    // A provider selected without its credentials fails silently at 3am
    // otherwise: the first SMS just never arrives. Catch it at boot instead.
    const require = (condition: boolean, path: string, message: string): void => {
      if (!condition) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };

    if (env.SMS_PROVIDER === 'eskiz') {
      require(Boolean(
        env.ESKIZ_EMAIL && env.ESKIZ_PASSWORD,
      ), 'ESKIZ_EMAIL', 'Eskiz credentials required');
    }
    if (env.SMS_PROVIDER === 'playmobile') {
      require(Boolean(
        env.PLAYMOBILE_LOGIN && env.PLAYMOBILE_PASSWORD,
      ), 'PLAYMOBILE_LOGIN', 'Playmobile credentials required');
    }
    if (env.MAPS_PROVIDER === 'google') {
      require(Boolean(env.GOOGLE_MAPS_API_KEY), 'GOOGLE_MAPS_API_KEY', 'Google Maps key required');
    }
    if (env.MAPS_PROVIDER === 'yandex') {
      require(Boolean(env.YANDEX_MAPS_API_KEY), 'YANDEX_MAPS_API_KEY', 'Yandex Maps key required');
    }
    if (env.MAPS_PROVIDER === '2gis') {
      require(Boolean(env.DGIS_API_KEY), 'DGIS_API_KEY', '2GIS key required');
    }
    if (env.PAYMENTS_DEFAULT_PROVIDER === 'payme') {
      require(Boolean(
        env.PAYME_MERCHANT_ID && env.PAYME_SECRET_KEY,
      ), 'PAYME_MERCHANT_ID', 'Payme credentials required');
    }
    if (env.PAYMENTS_DEFAULT_PROVIDER === 'click') {
      require(Boolean(
        env.CLICK_MERCHANT_ID && env.CLICK_SERVICE_ID && env.CLICK_SECRET_KEY,
      ), 'CLICK_MERCHANT_ID', 'Click credentials required');
    }
    if (env.PAYMENTS_DEFAULT_PROVIDER === 'uzum') {
      require(Boolean(
        env.UZUM_MERCHANT_ID && env.UZUM_SECRET_KEY,
      ), 'UZUM_MERCHANT_ID', 'Uzum credentials required');
    }
    if (env.STORAGE_PROVIDER === 's3') {
      require(Boolean(
        env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY,
      ), 'STORAGE_ACCESS_KEY', 'S3 credentials required');
    }

    // Placeholder secrets from .env.example must never reach production.
    if (env.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET'] as const) {
        require(!env[key].includes('replace_with'), key, `${key} still holds the example value`);
      }
      require(env.JWT_ACCESS_SECRET !==
        env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET', 'Access and refresh secrets must differ');
    }
  });

export type Env = z.infer<typeof envSchema>;
