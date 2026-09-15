/**
 * Domain error classes: NotFound, Conflict, Validation, Forbidden, InvalidStateTransition, PaymentFailed ...
 */
import type { OrderStatus } from '@bazar/constants';
import { AppError, type AppErrorOptions } from './app.error.js';
import { ERROR_CODE, type ErrorCode } from './error-codes.js';

export class ValidationError extends AppError {
  constructor(details: Record<string, string[]>, message = 'Validation failed') {
    super(ERROR_CODE.VALIDATION, 422, message, { details });
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(
      ERROR_CODE.NOT_FOUND,
      404,
      id === undefined ? `${entity} not found` : `${entity} ${id} not found`,
      { meta: { entity, id } },
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODE.CONFLICT) {
    super(code, 409, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', options: AppErrorOptions = {}) {
    super(ERROR_CODE.FORBIDDEN, 403, message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code: ErrorCode = ERROR_CODE.UNAUTHORIZED) {
    super(code, 401, message);
  }
}

export class RateLimitedError extends AppError {
  /** Seconds until the caller may retry; surfaced as Retry-After. */
  readonly retryAfter: number;

  constructor(retryAfter: number, message = 'Too many requests') {
    super(ERROR_CODE.RATE_LIMITED, 429, message, { meta: { retryAfter } });
    this.retryAfter = retryAfter;
  }
}

/**
 * The state machine refused a move. Carries both ends so the log says what was
 * attempted, not just that something was rejected.
 */
export class InvalidStateTransitionError extends AppError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(ERROR_CODE.INVALID_STATE_TRANSITION, 409, `Cannot move order from ${from} to ${to}`, {
      meta: { from, to },
    });
  }
}

export class PaymentFailedError extends AppError {
  constructor(reason: string, options: AppErrorOptions = {}) {
    super(ERROR_CODE.PAYMENT_FAILED, 402, reason, options);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor() {
    super(ERROR_CODE.INSUFFICIENT_BALANCE, 402, 'Insufficient balance');
  }
}

export class UndeliverableAddressError extends AppError {
  constructor(reason = 'Address is outside every delivery zone') {
    super(ERROR_CODE.UNDELIVERABLE_ADDRESS, 422, reason);
  }
}

export class NoCourierAvailableError extends AppError {
  constructor() {
    super(ERROR_CODE.NO_COURIER_AVAILABLE, 503, 'No courier available right now');
  }
}

export class StoreClosedError extends AppError {
  constructor(storeId: string) {
    super(ERROR_CODE.STORE_CLOSED, 409, 'Store is closed', { meta: { storeId } });
  }
}

export class ProductUnavailableError extends AppError {
  constructor(productId: string) {
    super(ERROR_CODE.PRODUCT_UNAVAILABLE, 409, 'Product is unavailable', { meta: { productId } });
  }
}

export class CouponError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(code, 422, message);
  }
}

/** An upstream vendor failed. 502, because the caller did nothing wrong. */
export class ProviderError extends AppError {
  constructor(provider: string, message: string, options: AppErrorOptions = {}) {
    super(ERROR_CODE.PROVIDER_ERROR, 502, `${provider}: ${message}`, {
      ...options,
      meta: { ...options.meta, provider },
    });
  }
}

export class TenantNotResolvedError extends AppError {
  constructor() {
    super(ERROR_CODE.TENANT_NOT_RESOLVED, 400, 'Tenant could not be resolved for this request');
  }
}
