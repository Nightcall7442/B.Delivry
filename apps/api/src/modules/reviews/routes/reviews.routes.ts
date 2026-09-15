/**
 * Reviews route definitions — mounted by src/routes/reviews.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer, requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { ReviewsController } from '../controller/reviews.controller.js';
import {
  createReviewSchema,
  replyReviewSchema,
  reviewIdParamsSchema,
  reviewsListQuerySchema,
  setPublishedSchema,
  summaryQuerySchema,
} from '../schemas/index.js';

export function reviewsRoutes(controller: ReviewsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Published reviews and rating summaries are part of the storefront.
    app.get('/', { preHandler: validate({ query: reviewsListQuerySchema }) }, controller.list);
    app.get(
      '/summary',
      { preHandler: validate({ query: summaryQuerySchema }) },
      controller.summary,
    );

    app.post(
      '/',
      { preHandler: [requireAuth, requireCustomer, validate({ body: createReviewSchema })] },
      controller.create,
    );

    // Replies come from the vendor or courier being reviewed; the service
    // checks which, and falls back to the moderation permission.
    app.post(
      '/:id/reply',
      {
        preHandler: [
          requireAuth,
          validate({ params: reviewIdParamsSchema, body: replyReviewSchema }),
        ],
      },
      controller.reply,
    );

    app.put(
      '/:id/published',
      {
        preHandler: [
          requireAuth,
          requirePermission(PERMISSION.SUPPORT_HANDLE),
          validate({ params: reviewIdParamsSchema, body: setPublishedSchema }),
        ],
      },
      controller.setPublished,
    );
  };
}
