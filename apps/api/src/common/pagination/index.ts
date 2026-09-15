/**
 * Pagination helpers (cursor + offset), PaginatedResult<T>.
 */
import { PAGINATION } from '@bazar/constants';
import type { PaginationMeta } from '@bazar/types';

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface OffsetParams {
  page: number;
  pageSize: number;
}

/**
 * What a caller may pass in. Spelled out rather than `Partial<OffsetParams>`
 * because every caller spreads a parsed query object, where a key is present
 * and undefined — which `exactOptionalPropertyTypes` treats as a real value.
 */
export interface OffsetInput {
  page?: number | undefined;
  pageSize?: number | undefined;
}

/** Clamps whatever arrived so a hostile `pageSize=1000000` cannot hit the DB. */
export function normalizeOffset(input: OffsetInput): OffsetParams {
  const page = Math.max(1, Math.trunc(input.page ?? PAGINATION.DEFAULT_PAGE));
  const pageSize = Math.min(
    PAGINATION.MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? PAGINATION.DEFAULT_PAGE_SIZE)),
  );
  return { page, pageSize };
}

/** Prisma take/skip for an offset page. */
export const toPrismaPage = (params: OffsetParams): { skip: number; take: number } => ({
  skip: (params.page - 1) * params.pageSize,
  take: params.pageSize,
});

export function paginate<T>(items: T[], total: number, params: OffsetParams): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    items,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages,
      hasNext: params.page < totalPages,
    },
  };
}

/**
 * Cursor paging for feeds that grow at the head (order history, locations,
 * notifications): offset paging would skip or repeat rows as new ones arrive.
 * The cursor is just the last id, base64 so clients do not parse it.
 */
export const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined || cursor.length === 0) return undefined;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  return decoded.length > 0 ? decoded : undefined;
}

export interface CursorParams {
  cursor?: string | undefined;
  limit: number;
}

export function normalizeCursor(input: {
  cursor?: string | undefined;
  limit?: number | undefined;
}): CursorParams {
  return {
    cursor: input.cursor,
    limit: Math.min(
      PAGINATION.MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(input.limit ?? PAGINATION.DEFAULT_PAGE_SIZE)),
    ),
  };
}

/**
 * Fetch `limit + 1` rows, hand them here: the extra row is what proves there is
 * a next page without a second COUNT query.
 */
export function paginateCursor<T extends { id: string }>(
  rows: T[],
  params: CursorParams,
): PaginatedResult<T> {
  const hasNext = rows.length > params.limit;
  const items = hasNext ? rows.slice(0, params.limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    pagination: {
      page: 1,
      pageSize: params.limit,
      total: items.length,
      totalPages: 1,
      hasNext,
      nextCursor: hasNext && last !== undefined ? encodeCursor(last.id) : null,
    },
  };
}

/** Prisma cursor args. `skip: 1` steps past the cursor row itself. */
export function toPrismaCursor(params: CursorParams): {
  take: number;
  skip?: number;
  cursor?: { id: string };
} {
  const id = decodeCursor(params.cursor);
  return {
    take: params.limit + 1,
    ...(id !== undefined ? { skip: 1, cursor: { id } } : {}),
  };
}
