/**
 * review types / DTOs.
 */
import type { Id, TenantEntity } from './common.js';

export const REVIEW_TARGET = {
  STORE: 'STORE',
  PRODUCT: 'PRODUCT',
  COURIER: 'COURIER',
} as const;

export type ReviewTarget = (typeof REVIEW_TARGET)[keyof typeof REVIEW_TARGET];

export interface ReviewDto extends TenantEntity {
  orderId: Id;
  customerId: Id;
  /** Shown as "Aziz K." — reviews are not anonymous but not full names either. */
  authorName: string;
  target: ReviewTarget;
  targetId: Id;
  /** 1..5. */
  rating: number;
  comment: string | null;
  photoUrls: string[];
  /** Vendor or courier answer. */
  reply: string | null;
  repliedAt: string | null;
  published: boolean;
}

export interface CreateReviewDto {
  orderId: Id;
  target: ReviewTarget;
  targetId: Id;
  rating: number;
  comment?: string;
  photoUrls?: string[];
}

export interface ReplyReviewDto {
  reply: string;
}

export interface ReviewListQuery {
  orderId?: Id;
  target?: ReviewTarget;
  targetId?: Id;
  minRating?: number;
  published?: boolean;
}

export interface RatingSummaryDto {
  average: number;
  count: number;
  /** How many reviews gave each score, indexed 1..5. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
