/**
 * Structured logger (pino) with requestId / tenantId bindings.
 */
import { pino, type Logger as PinoLogger } from 'pino';
import type { AppConfig } from '../../config/index.js';
import { getContext } from '../../common/tenant/tenant-context.js';

export type Logger = PinoLogger;

/**
 * Anything matching these is replaced before it reaches a log sink. Phones and
 * addresses are not secrets but they are personal data, and an OTP in a log
 * line is a live credential.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  '*.password',
  '*.passwordHash',
  'code',
  'codeHash',
  'refreshToken',
  'accessToken',
  'refreshTokenHash',
  'secretKey',
  'apiKey',
  '*.secretKey',
  '*.token',
];

export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.logLevel,
    name: config.name,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { env: config.env },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Pretty output is a development convenience; production ships raw JSON
    // straight to Loki, where a formatter would only get in the way.
    ...(config.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,env' },
          },
        }
      : {}),
  });
}

/**
 * Child logger carrying the current request. Every line written during a
 * request is then greppable by requestId without passing the logger around.
 */
export function contextLogger(logger: Logger): Logger {
  const context = getContext();
  if (context === undefined) return logger;
  return logger.child({
    requestId: context.requestId,
    tenantId: context.tenantId,
    ...(context.user !== null ? { userId: context.user.id } : {}),
  });
}
