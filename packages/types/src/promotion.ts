/**
 * promotion types / DTOs.
 */
import type { Id, MoneyDto, TenantEntity, Translated } from './common.js';

export const DISCOUNT_TYPE = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
  FREE_DELIVERY: 'FREE_DELIVERY',
} as const;

export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];

export interface PromotionDto extends TenantEntity {
  name: Translated;
  description: Translated | null;
  discountType: DiscountType;
  /** Percent for PERCENT, minor units for FIXED, ignored for FREE_DELIVERY. */
  value: number;
  /** Caps a percent discount so 50% off cannot cost more than this. */
  maxDiscount: MoneyDto | null;
  minOrder: MoneyDto | null;
  storeIds: Id[];
  categoryIds: Id[];
  cityIds: Id[];
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  bannerUrl: string | null;
}

export interface CouponDto extends TenantEntity {
  promotionId: Id;
  code: string;
  /** null = unlimited. */
  maxRedemptions: number | null;
  maxPerCustomer: number;
  redemptionCount: number;
  /** Set for personal coupons issued as compensation. */
  customerId: Id | null;
  expiresAt: string | null;
  active: boolean;
}

export interface ApplyCouponDto {
  code: string;
  storeId: Id;
  subtotal: MoneyDto;
}

export interface CouponPreviewDto {
  valid: boolean;
  discount: MoneyDto;
  freeDelivery: boolean;
  /** Why it was refused: expired, used up, wrong store, below minimum. */
  reason: string | null;
}

export interface CreatePromotionDto {
  name: Translated;
  description?: Translated;
  discountType: DiscountType;
  value: number;
  maxDiscount?: MoneyDto;
  minOrder?: MoneyDto;
  storeIds?: Id[];
  categoryIds?: Id[];
  cityIds?: Id[];
  startsAt: string;
  endsAt?: string;
}

export type UpdatePromotionDto = Partial<CreatePromotionDto> & { active?: boolean };
