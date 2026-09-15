/**
 * Base AppError (code, httpStatus, i18n message key, details).
 */
import { ERROR_CODE, type ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  /** Per-field messages, for form validation. */
  details?: Record<string, string[]>;
  /** Extra context for logs only. Never serialized to the client. */
  meta?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Every error the API raises on purpose. The error handler trusts `httpStatus`
 * and `code` from these and reports anything else as a 500 with no detail,
 * which is what keeps stack traces and SQL out of client responses.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, string[]> | undefined;
  readonly meta: Record<string, unknown> | undefined;
  /** True for errors the caller can fix; false for our own faults. */
  readonly expected: boolean;

  constructor(code: ErrorCode, httpStatus: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = options.details;
    this.meta = options.meta;
    this.expected = httpStatus < 500;
    Error.captureStackTrace?.(this, new.target);
  }

  /** i18n key clients may use instead of the English `message`. */
  get messageKey(): string {
    return `errors.${this.code}`;
  }

  toJSON(): { code: ErrorCode; message: string; details?: Record<string, string[]> } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** Last resort wrapper for anything thrown that was not an AppError. */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', options: AppErrorOptions = {}) {
    super(ERROR_CODE.INTERNAL, 500, message, options);
  }
}
