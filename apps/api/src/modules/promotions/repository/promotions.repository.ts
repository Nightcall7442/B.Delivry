/**
 * Promotions persistence (Prisma). Tenant-scoped.
 */
import type { Coupon, Prisma, Promotion } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import { ConflictError, CouponError } from '../../../common/errors/domain.errors.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
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
   *
   * The limits are enforced here, in the write, not only read beforehand by `evaluate`: two orders
   * placed at the same moment both pass that check. The counter bump is conditional (and takes the
   * coupon's row lock for the rest of the transaction), so the last redemption goes to one of them,
   * and the per-customer count is taken only after that lock is held.
   */
  async redeem(
    couponId: string,
    customerId: string,
    orderId: string,
    discount: number,
    tx: PrismaTransaction,
  ): Promise<void> {
    const claimed = await tx.coupon.updateMany({
      where: {
        ...this.scoped({ id: couponId }),
        active: true,
        OR: [
          { maxRedemptions: null },
          { redemptionCount: { lt: tx.coupon.fields.maxRedemptions } },
        ],
      },
      data: { redemptionCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      throw new CouponError(ERROR_CODE.COUPON_EXHAUSTED, 'Coupon has been fully used');
    }

    const coupon = await tx.coupon.findUnique({
      where: { id: couponId },
      select: { maxPerCustomer: true },
    });
    const used = await tx.couponRedemption.count({ where: { couponId, customerId } });
    if (coupon === null || used >= coupon.maxPerCustomer) {
      throw new CouponError(ERROR_CODE.COUPON_EXHAUSTED, 'You have already used this coupon');
    }

    await tx.couponRedemption.create({
      data: { couponId, customerId, orderId, discount },
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

  async findPromotion(id: string): Promise<Promotion | null> {
    return this.prisma.promotion.findFirst({ where: this.scoped({ id }) });
  }

  async updatePromotion(id: string, data: Prisma.PromotionUpdateInput): Promise<Promotion> {
    return this.prisma.promotion.update({ where: { id, ...this.tenantScope() }, data });
  }

  /** A personal coupon is issued to someone of this tenant, not to any id the admin typed. */
  async customerExists(id: string): Promise<boolean> {
    return (await this.prisma.customer.count({ where: this.scoped({ id }) })) > 0;
  }

  async createCoupon(data: Prisma.CouponUncheckedCreateInput): Promise<Coupon> {
    try {
      return await this.prisma.coupon.create({ data });
    } catch (error) {
      // (tenantId, code) is unique: a taken code is the admin's to change, not a server error.
      if ((error as { code?: string } | null)?.code === 'P2002') {
        throw new ConflictError('A coupon with this code already exists');
      }
      throw error;
    }
  }

  async listCoupons(promotionId: string): Promise<Coupon[]> {
    return this.prisma.coupon.findMany({
      where: this.scoped({ promotionId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** False when there is no such coupon in this tenant: a bare id must not reach another tenant's. */
  async deactivateCoupon(id: string): Promise<boolean> {
    const result = await this.prisma.coupon.updateMany({
      where: this.scoped({ id }),
      data: { active: false },
    });
    return result.count > 0;
  }
}
