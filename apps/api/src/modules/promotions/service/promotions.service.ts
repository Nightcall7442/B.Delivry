/**
 * Promotions business logic. Coupon validation, discount computation, redemption.
 */
import { PERMISSION, type Currency } from '@bazar/constants';
import { compare, money, percentage, zero, type Money } from '@bazar/payments';
import type { Coupon, Prisma, Promotion } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  CouponError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '../../../common/errors/domain.errors.js';
import type { PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type {
  CouponWithPromotion,
  PromotionsRepository,
} from '../repository/promotions.repository.js';
import type { AppliedCoupon, CouponPreview, PromotionListFilters } from '../types/index.js';

export interface PromotionsServiceDeps extends ServiceDeps {
  repository: PromotionsRepository;
  /** Injectable for tests; the wall clock otherwise. */
  now?: () => number;
}

/**
 * Codes that match nothing, per customer, in a sliding window. A code is the only secret between a
 * customer and a compensation coupon, and `preview` answers instantly: without a budget on the
 * misses it is an oracle that can be asked a few thousand times a minute from one account.
 * In memory, so the budget is per process; a shared one belongs in the route's rate limiter.
 */
const MAX_CODE_MISSES = 10;
const CODE_MISS_WINDOW_MS = 10 * 60_000;
const MAX_TRACKED_CUSTOMERS = 10_000;

export class PromotionsService extends BaseService {
  private readonly repository: PromotionsRepository;
  private readonly now: () => number;
  private readonly misses = new Map<string, number[]>();

  constructor(deps: PromotionsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.now = deps.now ?? Date.now;
  }

  private recentMisses(customerId: string): number[] {
    const since = this.now() - CODE_MISS_WINDOW_MS;
    const recent = (this.misses.get(customerId) ?? []).filter((at) => at > since);
    if (recent.length === 0) this.misses.delete(customerId);
    else this.misses.set(customerId, recent);
    return recent;
  }

  private assertCodeBudget(customerId: string): void {
    const recent = this.recentMisses(customerId);
    if (recent.length >= MAX_CODE_MISSES) {
      const retryAfter = Math.ceil(((recent[0] ?? 0) + CODE_MISS_WINDOW_MS - this.now()) / 1000);
      throw new RateLimitedError(Math.max(retryAfter, 1), 'Too many coupon attempts, try later');
    }
  }

  private recordMiss(customerId: string): void {
    // Customers who miss once and never return would otherwise stay in the map for good.
    if (this.misses.size >= MAX_TRACKED_CUSTOMERS) {
      for (const tracked of [...this.misses.keys()]) this.recentMisses(tracked);
    }
    this.misses.set(customerId, [...this.recentMisses(customerId), this.now()]);
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
    this.assertCodeBudget(customerId);

    const coupon = await this.repository.findCoupon(code.toUpperCase());
    // Someone else's personal coupon is answered exactly like a code that does not exist: telling
    // them apart would confirm to a guesser that the guess was a real code.
    if (coupon === null || (coupon.customerId !== null && coupon.customerId !== customerId)) {
      this.recordMiss(customerId);
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
      // A spent attempt budget is the caller's to be told about (429 and Retry-After), not a reason
      // to show beside the coupon field.
      if (error instanceof RateLimitedError) throw error;
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

    // A personal coupon issued as compensation belongs to one customer only; `evaluate` has already
    // refused everyone else, before any of the reasons above could confirm it exists.
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
        // Never more than the goods cost, whatever the stored percentage says: the update schema
        // does not carry the "at most 100" rule the create one has.
        const whole = percentage(subtotal, promotion.value);
        const raw = compare(whole, subtotal) > 0 ? subtotal : whole;
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
    // The storefront shows what is running. Drafts, ended campaigns and the ones scheduled for later
    // are the desk's: an anonymous caller (this route is public) gets the running ones whatever
    // they ask for.
    const context = this.context();
    const desk =
      context.system === true ||
      (context.user !== null && context.user.permissions.includes(PERMISSION.PROMOTION_WRITE));
    return this.repository.listPromotions(desk ? filters : { ...filters, activeOnly: true });
  }

  async createPromotion(data: Prisma.PromotionUncheckedCreateInput): Promise<Promotion> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.createPromotion({ ...data, tenantId: this.tenantId() });
  }

  async updatePromotion(id: string, data: Prisma.PromotionUpdateInput): Promise<Promotion> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    const current = await this.repository.findPromotion(id);
    if (current === null) throw new NotFoundError('Promotion', id);

    // Whose a row is, and which row it is, are not up for editing whatever else the body carried.
    const {
      tenantId: _tenantId,
      id: _id,
      ...patch
    } = data as Prisma.PromotionUpdateInput & { tenantId?: unknown; id?: unknown };
    this.assertConsistent(current, patch);
    return this.repository.updatePromotion(id, patch);
  }

  /**
   * The create schema refuses a percentage over 100 and an end before the start; the update one is
   * that schema made partial, so it refuses neither. What the promotion would be after the patch is
   * what has to hold.
   */
  private assertConsistent(current: Promotion, patch: Prisma.PromotionUpdateInput): void {
    const discountType =
      typeof patch.discountType === 'string' ? patch.discountType : current.discountType;
    const value = typeof patch.value === 'number' ? patch.value : current.value;
    const startsAt = patch.startsAt instanceof Date ? patch.startsAt : current.startsAt;
    const endsAt = patch.endsAt === undefined ? current.endsAt : patch.endsAt;

    if (discountType === 'PERCENT' && value > 100) {
      throw new ValidationError({ value: ['Percent discount cannot exceed 100'] });
    }
    if (endsAt instanceof Date && endsAt <= startsAt) {
      throw new ValidationError({ endsAt: ['endsAt must be after startsAt'] });
    }
  }

  async createCoupon(data: Prisma.CouponUncheckedCreateInput): Promise<Coupon> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    // The promotion carries the discount, so a coupon must hang off one of this tenant's, and a
    // personal one must name one of its customers: a bare id from another tenant is not a reference.
    if ((await this.repository.findPromotion(data.promotionId)) === null) {
      throw new NotFoundError('Promotion', data.promotionId);
    }
    if (
      data.customerId !== undefined &&
      data.customerId !== null &&
      !(await this.repository.customerExists(data.customerId))
    ) {
      throw new NotFoundError('Customer', data.customerId);
    }
    return this.repository.createCoupon({
      promotionId: data.promotionId,
      tenantId: this.tenantId(),
      code: data.code.toUpperCase(),
      ...(data.maxRedemptions !== undefined ? { maxRedemptions: data.maxRedemptions } : {}),
      ...(data.maxPerCustomer !== undefined ? { maxPerCustomer: data.maxPerCustomer } : {}),
      ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
    });
  }

  async listCoupons(promotionId: string): Promise<Coupon[]> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    return this.repository.listCoupons(promotionId);
  }

  async deactivateCoupon(id: string): Promise<void> {
    this.authorize(PERMISSION.PROMOTION_WRITE);
    if (!(await this.repository.deactivateCoupon(id))) throw new NotFoundError('Coupon', id);
  }

  moneyFor(amount: number, currency: Currency): Money {
    return money(amount, currency);
  }
}
