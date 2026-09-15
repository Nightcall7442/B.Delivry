/**
 * Zod schemas: pagination.
 */
import { PAGINATION } from '@bazar/constants';
import { z } from 'zod';

/** Query strings arrive as text, so numbers are coerced before the bounds check. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
});

export const cursorPaginationSchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
});

export const sortSchema = z.object({
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export const listQuerySchema = paginationSchema.merge(sortSchema).merge(searchSchema);

export type PaginationInput = z.infer<typeof paginationSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
