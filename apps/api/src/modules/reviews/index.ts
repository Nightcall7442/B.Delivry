/**
 * Reviews module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { ReviewsService } from './service/reviews.service.js';
export { ReviewsRepository } from './repository/reviews.repository.js';
export { ReviewsController } from './controller/reviews.controller.js';
export { reviewsRoutes } from './routes/reviews.routes.js';
export type {
  CreateReviewInput,
  RatingSummary,
  ReviewListFilters,
  ReviewTarget,
} from './types/index.js';
