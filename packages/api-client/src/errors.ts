/**
 * ApiError mapping from API error codes.
 *
 * One error class for everything the client can throw: the API's own
 * `{ code, message, details }` envelope, plus two synthetic codes for the cases
 * where there is no envelope — the network died, or the body was not ours.
 */
import type { ApiError as ApiErrorDto } from '@bazar/types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, string[]> | undefined;
  readonly requestId: string | undefined;

  constructor(status: number, dto: ApiErrorDto) {
    super(dto.message);
    this.name = 'ApiError';
    this.code = dto.code;
    this.status = status;
    this.details = dto.details;
    this.requestId = dto.requestId;
  }

  /** Fetch threw: offline, DNS, CORS, aborted. */
  static network(cause: unknown): ApiError {
    const error = new ApiError(0, { code: 'NETWORK', message: 'Network request failed' });
    error.cause = cause;
    return error;
  }

  /** A body that was not the API envelope (a proxy page, an HTML 502). */
  static malformed(status: number): ApiError {
    return new ApiError(status, {
      code: 'MALFORMED_RESPONSE',
      message: `Unexpected response (${status})`,
    });
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
