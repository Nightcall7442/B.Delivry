/**
 * Reviews module-internal types & DTOs.
 */
export type ReviewTarget = 'STORE' | 'PRODUCT' | 'COURIER';

export interface CreateReviewInput {
  orderId: string;
  target: ReviewTarget;
  targetId: string;
  rating: number;
  comment?: string | undefined;
  photoUrls?: string[] | undefined;
}

export interface ReviewListFilters {
  orderId?: string | undefined;
  target?: ReviewTarget | undefined;
  targetId?: string | undefined;
  minRating?: number | undefined;
  published?: boolean | undefined;
  customerId?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
