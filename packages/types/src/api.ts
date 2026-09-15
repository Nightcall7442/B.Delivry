/**
 * api types / DTOs.
 */

/**
 * The response envelope every endpoint returns. Clients branch on `ok` alone,
 * so a transport error and a business error are handled the same way.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiFailure {
  ok: false;
  error: ApiError;
}

export interface ApiError {
  /** Machine-readable, stable across releases (see common/errors/error-codes). */
  code: string;
  /** English fallback text. Clients prefer their own translation of `code`. */
  message: string;
  /** Per-field messages for form validation. */
  details?: Record<string, string[]>;
  requestId?: string;
}

export interface ResponseMeta {
  requestId?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  /** Present on cursor-paginated feeds (order history, courier locations). */
  nextCursor?: string | null;
}

export interface PaginatedDto<T> {
  items: T[];
  pagination: PaginationMeta;
}

/** Offset paging for admin tables, cursor paging for infinite feeds. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  cursor?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
}
