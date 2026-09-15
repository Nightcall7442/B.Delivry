/**
 * Promotions business logic. Coupon validation, discount computation, redemption.
 */
import { PERMISSION, type Currency } from '@bazar/constants';
import { compare, money, percentage, zero, type Money } from '@bazar/payments';
import type { Coupon, Prisma, Promotion } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import { CouponError } from '../../../common/errors/domain.errors.js';
import type { PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type {
  CouponWithPromotion,
  PromotionsRepository,
} from '../repository/promotions.repository.js';
import type { AppliedCoupon, CouponPreview, PromotionListFilters } from '../types/index.js';

export interface PromotionsServiceDeps extends ServiceDeps {
  repository: PromotionsRepository;
}

export class PromotionsService extends BaseService {
  private readonly repository: PromotionsRepository;

  constructor(deps: PromotionsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
  }

  /**
   * Full validation, throwing on refusal. Used by order creation, where a bad
   * coupon must stop the order rather than silently charge full price.
   */
  async evaluate(
    code: string,
    storeId: string,
    subtotal: Money,
    customerId: string,
  ): Promise<AppliedCoupon> {
    const coupon = await this.repository.findCoupon(code.toUpperCase());
    if (coupon === null) {
      throw new CouponError(ERROR_CODE.COUPON_INVALID, 'Coupon not found');
    }

    const failure = await this.checkEligibility(coupon, storeId, subtotal, customerId);
    if (failure !== null) throw failure;

    const discount = this.discountFor(coupon.promotion, subtotal);

    return {
      couponId: coupon.id,
      promotionId: coupon.promotionId,
      code: coupon.code,
      discount,
      freeDelivery: coupon.promotion.discountType === 'FREE_DELIVERY',
    };
  }

  /** Non-throwing variant for the checkout screen, which shows the reason. */
  async preview(
    code: string,
    storeId: string,
    subtotal: Money,
    customerId: string,
  ): Promise<CouponPreview> {
    try {
      const applied = await this.evaluate(code, storeId, subtotal, customerId);
      return {
        valid: true,
        discount: applied.discount,
        freeDelivery: applied.freeDelivery,
        reason: null,
      };
    } catch (error) {
      return {
        valid: false,
        discount: zero(subtotal.currency),
        freeDelivery: false,
        reason: error instanceof Error ? error.message : 'Coupon cannot be applied',
      };
    }
  }

  /**
   * Every reason a coupon can be refused, in the order a person would check
   * them. Returns the error instead of throwing so `preview` can reuse it.
   */
  private async checkEligibility(
    coupon: CouponWithPromotion,
    storeId: string,
    subtotal: Money,
    customerId: string,
  ): Promise<CouponError | null> {
    const now = new Date();
    const { promotion } = coupon;

    if (coupon.expiresAt !== null && coupon.expiresAt < now) {
      return new CouponError(ERROR_CODE.COUPON_EXPIRED, 'Coupon has expired');
    }
    if (!promotion.active || promotion.startsAt > now) {
      return new CouponError(ERROR_CODE.COUPON_INVALID, 'Promotion is not running');
    }
    if (promotion.endsAt !== null && promotion.endsAt < now) {
      return new CouponError(ERROR_CODE.COUPON_EXPIRED, 'Promotion has ended');
    }

    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return new CouponError(ERROR_CODE.COUPON_EXHAUSTED, 'Coupon has been fully used');
    }

    // A personal coupon issued as compensation belongs to one customer only.
    if (coupon.customerId !== null && coupon.customerId !== customerId) {
      return new CouponError(ERROR_CODE.COUPON_INVALID, 'Coupon is not valid for this account');
    }

    const used = await this.repository.countRedemptions(coupon.id, customerId);
    if (used >= coupon.maxPerCustomer) {
      return new CouponError(ERROR_CODE.COUPON_EXHAUSTED, 'You have already used this coupon');
    }

    // An empty store list means "every store".
    if (promotion.storeIds.length > 0 && !promotion.storeIds.includes(storeId)) {
      return new CouponError(ERROR_CODE.COUPON_INVALID, 'Coupon does not apply to this store');
    }

    if (promotion.minOrder !== null) {
      const minimum = money(promotion.minOrder, subtotal.currency);
      if (compare(subtotal, minimum) < 0) {
        return new CouponError(
          ERROR_CODE.COUPON_INVALID,
          'Order is below the minimum for this coupon',
        );
      }
    }

    return null;
  }

  /**
   * PERCENT is capped by maxDiscount when set, so "50% off" cannot cost more
   * than the campaign budgeted. FIXED never exceeds the subtotal, so a
   * discount cannot turn into store credit.
   */
  private discountFor(promotion: Promotion, subtotal: Money): Money {
    const currency = subtotal.currency;

    switch (promotion.discountType) {
      case 'PERCENT': {
        const raw = percentage(subtotal, promotion.value);
        if (promotion.maxDiscount === null) return raw;
        const cap = money(promotion.maxDiscount, currency);
        return compare(raw, cap) > 0 ? cap : raw;
      }
      case 'FIXED': {
        const fixed = money(Math.round(promotion.value), currency);
        return compare(fixed, subtotal) > 0 ? subtotal : fixed;
      }
      case 'FREE_DELIVERY':
        // The saving is on the delivery fee, which pricing zeroes out; there
        // is nothing to subtract from the goods.
        return zero(currency);
      default:
        return zero(currency);
    }
  }

  async redeem(
    couponId: string,
    customerId: string,
    orderId: string,
    discount: Money,
    tx: PrismaTransaction,
  ): Promise<void> {
    await this.repository.redeem(couponId, customerId, orderId, discount.amount, tx);
  }

  /** Cancelled order: give the coupon back rather than silently eating it. */
  async release(orderId: string): Promise<void> {
    await this.repository.releaseRedemption(orderId);
  }

  // ------------------------------------------------------------------ admin

  async listPromotions(filters: PromotionListFilters): Promise<PaginatedResult<Promotion>> {
    return this.repository.listPromotions(filters);
  }

  async createPromotion(data: Prisma.PromotionUncheckedCreateInput): Promise<Promotion> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.createPromotion({ ...data, tenantId: this.tenantId() });
  }

  async updatePromotion(id: string, data: Prisma.PromotionUpdateInput): Promise<Promotion> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.updatePromotion(id, data);
  }

  async createCoupon(data: Prisma.CouponUncheckedCreateInput): Promise<Coupon> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.createCoupon({
      ...data,
      tenantId: this.tenantId(),
      code: data.code.toUpperCase(),
    });
  }

  async listCoupons(promotionId: string): Promise<Coupon[]> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.listCoupons(promotionId);
  }

  async deactivateCoupon(id: string): Promise<void> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    await this.repository.deactivateCoupon(id);
  }

  moneyFor(amount: number, currency: Currency): Money {
    return money(amount, currency);
  }
}
