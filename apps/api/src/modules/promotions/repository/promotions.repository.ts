/**
 * Promotions persistence (Prisma). Tenant-scoped.
 */
import type { Coupon, Prisma, Promotion } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { PromotionListFilters } from '../types/index.js';

export type CouponWithPromotion = Coupon & { promotion: Promotion };

export class PromotionsRepository extends BaseRepository {
  async findCoupon(code: string): Promise<CouponWithPromotion | null> {
    return this.prisma.coupon.findFirst({
      where: this.scoped({ code, active: true }),
      include: { promotion: true },
    });
  }

  /** How many times this customer has already used this coupon. */
  async countRedemptions(couponId: string, customerId: string): Promise<number> {
    return this.prisma.couponRedemption.count({ where: { couponId, customerId } });
  }

  /**
   * Records the use and bumps the counter in one transaction. The unique
   * constraint on orderId is what makes a retried order creation idempotent
   * instead of burning two redemptions.
   */
  async redeem(
    couponId: string,
    customerId: string,
    orderId: string,
    discount: number,
    tx: PrismaTransaction,
  ): Promise<void> {
    await tx.couponRedemption.create({
      data: { couponId, customerId, orderId, discount },
    });
    await tx.coupon.update({
      where: { id: couponId },
      data: { redemptionCount: { increment: 1 } },
    });
  }

  /** Order cancelled before delivery: the coupon goes back to the customer. */
  async releaseRedemption(orderId: string): Promise<void> {
    const redemption = await this.prisma.couponRedemption.findUnique({ where: { orderId } });
    if (redemption === null) return;

    await this.prisma.$transaction([
      this.prisma.couponRedemption.delete({ where: { orderId } }),
      this.prisma.coupon.update({
        where: { id: redemption.couponId },
        data: { redemptionCount: { decrement: 1 } },
      }),
    ]);
  }

  async listPromotions(filters: PromotionListFilters): Promise<PaginatedResult<Promotion>> {
    const where: Prisma.PromotionWhereInput = {
      ...this.tenantScope(),
      ...(filters.activeOnly === true
        ? {
            active: true,
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
          }
        : {}),
    };

    return this.page(
      filters,
      (page) => this.prisma.promotion.findMany({ where, orderBy: { startsAt: 'desc' }, ...page }),
      () => this.prisma.promotion.count({ where }),
    );
  }

  async createPromotion(data: Prisma.PromotionUncheckedCreateInput): Promise<Promotion> {
    return this.prisma.promotion.create({ data });
  }

  async updatePromotion(id: string, data: Prisma.PromotionUpdateInput): Promise<Promotion> {
    return this.prisma.promotion.update({ where: { id }, data });
  }

  async createCoupon(data: Prisma.CouponUncheckedCreateInput): Promise<Coupon> {
    return this.prisma.coupon.create({ data });
  }

  async listCoupons(promotionId: string): Promise<Coupon[]> {
    return this.prisma.coupon.findMany({
      where: this.scoped({ promotionId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateCoupon(id: string): Promise<void> {
    await this.prisma.coupon.update({ where: { id }, data: { active: false } });
  }
}
