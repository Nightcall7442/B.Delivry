/**
 * Central error → HTTP response mapper (never leak internals).
 */
import type { ApiFailure } from '@bazar/types';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, InternalError, isAppError } from '../common/errors/app.error.js';
import { ERROR_CODE } from '../common/errors/error-codes.js';
import { RateLimitedError, ValidationError } from '../common/errors/domain.errors.js';
import {
  reportError,
  type ErrorContext,
  type ErrorReporter,
} from '../infrastructure/telemetry/error-reporting.js';
import { toFieldErrors } from './validation.middleware.js';

/** Prisma error codes that mean something specific to a client. */
const PRISMA_CODES: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: ERROR_CODE.CONFLICT, message: 'Resource already exists' },
  P2025: { status: 404, code: ERROR_CODE.NOT_FOUND, message: 'Resource not found' },
  P2003: { status: 409, code: ERROR_CODE.CONFLICT, message: 'Referenced resource is missing' },
};

const prismaCode = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : null;

/**
 * What an error report says about the request, and nothing else. The route is the pattern
 * (`/orders/:id`), not the URL: the URL carries ids, tokens and the query. No body, no headers.
 */
function failureContext(request: FastifyRequest, failure: AppError): ErrorContext {
  return {
    tags: {
      source: 'http',
      // The id the access log and the response carry: finds this request in the API logs.
      request_id: request.requestId ?? request.id,
      method: request.method,
      route: request.routeOptions.url,
      status: failure.httpStatus,
      error_code: failure.code,
      tenant_id: request.tenant?.tenantId ?? request.ctx?.tenantId,
    },
    userId: request.user?.id ?? null,
  };
}

/**
 * The only place an error becomes a response. Everything expected is reported
 * with its own code; everything else becomes a bare 500, because a stack
 * trace, a SQL fragment or a provider payload in a response body is how
 * internals leak to whoever is probing the API.
 *
 * What is not expected is also sent to error reporting (Sentry, when configured). The line is the
 * same one the log draws: a 4xx is the caller's situation, answered and finished; a 5xx is ours.
 * `reporter` is for tests; the API lets it default to the process's reporter.
 */
export function registerErrorHandler(app: FastifyInstance, reporter?: ErrorReporter): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId;
    const normalized = normalize(error);

    if (normalized.expected) {
      request.log.info(
        { err: error, code: normalized.code, status: normalized.httpStatus },
        'request failed',
      );
    } else {
      // Unexpected errors get the full object: this is the one that pages someone.
      request.log.error({ err: error, requestId }, 'unhandled error');
      // The original error, not the 500 it was wrapped in: that is the one with the stack.
      // Never throws: the response below is sent whatever the reporter does.
      reportError(error, () => failureContext(request, normalized), reporter);
    }

    if (normalized instanceof RateLimitedError) {
      void reply.header('retry-after', normalized.retryAfter);
    }

    const payload: ApiFailure = {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.expected ? normalized.message : 'Internal server error',
        ...(normalized.details !== undefined ? { details: normalized.details } : {}),
        requestId,
      },
    };

    void reply.code(normalized.httpStatus).send(payload);
  });
}

function normalize(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (error instanceof ZodError) {
    return new ValidationError(toFieldErrors(error));
  }

  const code = prismaCode(error);
  if (code !== null && PRISMA_CODES[code] !== undefined) {
    const mapped = PRISMA_CODES[code];
    return new AppError(mapped.code as never, mapped.status, mapped.message, { cause: error });
  }

  // Fastify's own errors carry a statusCode; body-too-large and malformed JSON
  // are the caller's problem and should not read as a server fault.
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const status = Number((error as { statusCode: unknown }).statusCode);
    if (Number.isFinite(status) && status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : 'Bad request';
      const mapped =
        status === 413
          ? ERROR_CODE.PAYLOAD_TOO_LARGE
          : status === 429
            ? ERROR_CODE.RATE_LIMITED
            : ERROR_CODE.VALIDATION;
      return new AppError(mapped, status, message, { cause: error });
    }
  }

  return new InternalError('Internal server error', { cause: error });
}
