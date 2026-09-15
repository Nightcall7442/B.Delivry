/** Endpoint functions for /reviews — rating the courier and the stall after delivery. */
import type { CreateReviewDto, ReviewDto, ReviewListQuery } from '@bazar/types';

import type { Http } from '../client.js';
import type { PageQuery } from './page.js';

export const reviewsApi = (http: Http) => ({
  create: (body: CreateReviewDto) => http.request<ReviewDto>('POST', '/reviews', { body }),
  list: (query: ReviewListQuery & PageQuery = {}) =>
    http.paginated<ReviewDto>('/reviews', { ...query }),
  /** What the customer already said about this order. */
  forOrder: (orderId: string) =>
    http.paginated<ReviewDto>('/reviews', { orderId, pageSize: 10 }).then((page) => page.items),
});
