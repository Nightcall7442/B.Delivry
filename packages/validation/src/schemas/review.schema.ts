/**
 * Zod schemas: review.
 */
import { LIMITS } from '@bazar/constants';
import { z } from 'zod';
import { idSchema, optionalText } from './common.schema.js';

export const reviewTargetSchema = z.enum(['STORE', 'PRODUCT', 'COURIER']);

export const ratingSchema = z.coerce.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  /** Reviews are only accepted for an order the customer actually received. */
  orderId: idSchema,
  target: reviewTargetSchema,
  targetId: idSchema,
  rating: ratingSchema,
  comment: optionalText(LIMITS.REVIEW_MAX_LENGTH),
  photoUrls: z.array(z.string().url().max(500)).max(5).optional(),
});

export const replyReviewSchema = z.object({
  reply: z.string().trim().min(1).max(LIMITS.REVIEW_MAX_LENGTH),
});

export const reviewListQuerySchema = z.object({
  orderId: idSchema.optional(),
  target: reviewTargetSchema.optional(),
  targetId: idSchema.optional(),
  minRating: ratingSchema.optional(),
  published: z.coerce.boolean().optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
