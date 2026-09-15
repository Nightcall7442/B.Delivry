/**
 * App configuration slice.
 */
import type { Locale } from '@bazar/constants';
import type { Env } from './env.schema.js';

export interface AppConfig {
  name: string;
  env: string;
  nodeEnv: Env['NODE_ENV'];
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  host: string;
  baseUrl: string;
  prefix: string;
  webUrl: string;
  adminUrl: string;
  defaultLocale: Locale;
  supportedLocales: Locale[];
  defaultCurrency: string;
  timezone: string;
  logLevel: Env['LOG_LEVEL'];
}

export function buildAppConfig(env: Env): AppConfig {
  return {
    name: env.APP_NAME,
    env: env.APP_ENV,
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    port: env.API_PORT,
    host: env.API_HOST,
    baseUrl: env.API_BASE_URL,
    prefix: env.API_PREFIX,
    webUrl: env.WEB_URL,
    adminUrl: env.ADMIN_URL,
    defaultLocale: env.DEFAULT_LOCALE,
    supportedLocales: env.SUPPORTED_LOCALES,
    defaultCurrency: env.DEFAULT_CURRENCY,
    timezone: env.DEFAULT_TIMEZONE,
    logLevel: env.LOG_LEVEL,
  };
}
