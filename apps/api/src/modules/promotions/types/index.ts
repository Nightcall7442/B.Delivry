/**
 * Promotions module-internal types & DTOs.
 */
import type { Money } from '@bazar/payments';

export type DiscountType = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';

/** A coupon that passed every check, with the discount already computed. */
export interface AppliedCoupon {
  couponId: string;
  promotionId: string;
  code: string;
  discount: Money;
  freeDelivery: boolean;
}

export interface CouponPreview {
  valid: boolean;
  discount: Money;
  freeDelivery: boolean;
  /** Why it was refused, in a form the checkout screen can show. */
  reason: string | null;
}

export interface PromotionInput {
  name: Record<string, string>;
  description?: Record<string, string> | undefined;
  discountType: DiscountType;
  value: number;
  maxDiscount?: Money | undefined;
  minOrder?: Money | undefined;
  storeIds?: string[] | undefined;
  categoryIds?: string[] | undefined;
  cityIds?: string[] | undefined;
  startsAt: Date;
  endsAt?: Date | undefined;
}

export interface PromotionListFilters {
  activeOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
