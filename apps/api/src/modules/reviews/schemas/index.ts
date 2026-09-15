/**
 * Reviews request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createReviewSchema, replyReviewSchema } from '@bazar/validation';

import { idSchema, listQuerySchema, ratingSchema, reviewTargetSchema } from '@bazar/validation';
import { z } from 'zod';

export const reviewIdParamsSchema = z.object({ id: idSchema });

export const reviewsListQuerySchema = listQuerySchema.extend({
  target: reviewTargetSchema.optional(),
  targetId: idSchema.optional(),
  minRating: ratingSchema.optional(),
  published: z.coerce.boolean().optional(),
});

export const summaryQuerySchema = z.object({
  target: reviewTargetSchema,
  targetId: idSchema,
});

export const setPublishedSchema = z.object({ published: z.boolean() });

export type ReviewsListQuery = z.infer<typeof reviewsListQuerySchema>;
