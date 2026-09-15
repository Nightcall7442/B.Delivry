/**
 * Result<T, E> helper type for explicit success/failure in services.
 */
import type { AppError } from './errors/index.js';

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;

/**
 * Use Result where failure is an expected outcome the caller must branch on
 * (a coupon that does not apply, a courier search that found nobody). Throw
 * AppError where failure means the request is over. Mixing the two is what
 * makes error handling unreadable, so pick per call site and stay with it.
 */
export function unwrap<T, E extends Error>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;
