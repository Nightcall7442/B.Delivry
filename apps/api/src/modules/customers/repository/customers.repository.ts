/**
 * Customers persistence (Prisma). Tenant-scoped.
 */
import type { Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CustomerListFilters, UpdateCustomerInput } from '../types/index.js';

const CUSTOMER_INCLUDE = {
  user: {
    select: { id: true, firstName: true, lastName: true, phone: true, email: true, status: true },
  },
} satisfies Prisma.CustomerInclude;

export type CustomerWithUser = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_INCLUDE }>;

export class CustomersRepository extends BaseRepository {
  async findById(id: string): Promise<CustomerWithUser | null> {
    return this.prisma.customer.findFirst({
      where: this.scoped({ id }),
      include: CUSTOMER_INCLUDE,
    });
  }

  async findByUserId(userId: string): Promise<CustomerWithUser | null> {
    return this.prisma.customer.findFirst({
      where: this.scoped({ userId }),
      include: CUSTOMER_INCLUDE,
    });
  }

  async list(filters: CustomerListFilters): Promise<PaginatedResult<CustomerWithUser>> {
    const where: Prisma.CustomerWhereInput = {
      ...this.tenantScope(),
      ...(filters.blocked === true ? { blockedAt: { not: null } } : {}),
      ...(filters.blocked === false ? { blockedAt: null } : {}),
      ...(filters.minOrders !== undefined ? { orderCount: { gte: filters.minOrders } } : {}),
      ...(filters.business === 'pending'
        ? { businessAppliedAt: { not: null }, businessApprovedAt: null }
        : {}),
      ...(filters.business === 'approved' ? { businessApprovedAt: { not: null } } : {}),
      ...(filters.search !== undefined
        ? {
            user: {
              OR: [
                { phone: { contains: filters.search } },
                { firstName: { contains: filters.search, mode: 'insensitive' as const } },
                { lastName: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    return this.page(
      filters,
      (page) =>
        this.prisma.customer.findMany({
          where,
          include: CUSTOMER_INCLUDE,
          orderBy: { lastOrderAt: 'desc' },
          ...page,
        }),
      () => this.prisma.customer.count({ where }),
    );
  }

  /** The customer applies with the company on the invoice; an operator grants credit. */
  async applyBusiness(
    id: string,
    companyName: string,
    companyInn: string,
  ): Promise<CustomerWithUser> {
    return this.prisma.customer.update({
      where: { id },
      data: { companyName, companyInn, businessAppliedAt: new Date() },
      include: CUSTOMER_INCLUDE,
    });
  }

  async setBusiness(
    id: string,
    input: { approved: boolean; creditDays: number; creditLimit: number },
  ): Promise<CustomerWithUser> {
    return this.prisma.customer.update({
      where: { id },
      data: {
        businessApprovedAt: input.approved ? new Date() : null,
        creditDays: input.creditDays,
        creditLimit: input.creditLimit,
      },
      include: CUSTOMER_INCLUDE,
    });
  }

  /** A profile for a user who never shopped (a vendor paying for a promotion). */
  async ensureForUser(userId: string, tenantId: string): Promise<string> {
    const existing = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing !== null) return existing.id;
    const created = await this.prisma.customer.create({
      data: { tenantId, userId },
      select: { id: true },
    });
    return created.id;
  }

  async update(id: string, input: UpdateCustomerInput): Promise<CustomerWithUser> {
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(input.defaultAddressId !== undefined
          ? { defaultAddressId: input.defaultAddressId }
          : {}),
        ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
        // Name and email live on the user record, not the customer profile.
        ...(input.firstName !== undefined ||
        input.lastName !== undefined ||
        input.email !== undefined
          ? {
              user: {
                update: {
                  ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
                  ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
                  ...(input.email !== undefined ? { email: input.email } : {}),
                },
              },
            }
          : {}),
      },
      include: CUSTOMER_INCLUDE,
    });
  }

  /**
   * Order counters kept on the customer row, updated when an order is
   * delivered. Cheaper than counting orders on every profile view, and the
   * numbers only ever move forward.
   */
  /** The code to share; minted on first ask so nobody gets one they never use. */
  async ensureReferralCode(customerId: string, mint: () => string): Promise<string> {
    const row = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { referralCode: true },
    });
    if (row.referralCode !== null) return row.referralCode;
    // Two accounts could mint the same six letters; the unique index says so and we try again.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referralCode = mint();
      try {
        await this.prisma.customer.update({ where: { id: customerId }, data: { referralCode } });
        return referralCode;
      } catch {
        // taken — mint another
      }
    }
    throw new Error('Could not mint a referral code');
  }

  findByReferralCode(referralCode: string) {
    return this.prisma.customer.findUnique({
      where: { referralCode },
      select: { id: true, userId: true },
    });
  }

  async setReferredBy(customerId: string, referredById: string): Promise<void> {
    await this.prisma.customer.update({ where: { id: customerId }, data: { referredById } });
  }

  /**
   * Marks the referral paid out and returns both sides — exactly once: the
   * conditional update is what makes a replayed event a no-op.
   */
  async claimReferralReward(customerId: string): Promise<{
    referred: { customerId: string; userId: string };
    referrer: { customerId: string; userId: string };
  } | null> {
    const row = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { userId: true, referredById: true, referralRewardedAt: true },
    });
    if (row === null || row.referredById === null || row.referralRewardedAt !== null) return null;
    const referrer = await this.prisma.customer.findUnique({
      where: { id: row.referredById },
      select: { id: true, userId: true },
    });
    if (referrer === null) return null;
    const { count } = await this.prisma.customer.updateMany({
      where: { id: customerId, referralRewardedAt: null },
      data: { referralRewardedAt: new Date() },
    });
    if (count === 0) return null;
    return {
      referred: { customerId, userId: row.userId },
      referrer: { customerId: referrer.id, userId: referrer.userId },
    };
  }

  /** Extends from whichever is later: today or the current expiry. */
  async extendPlus(customerId: string, days: number): Promise<Date> {
    const row = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      select: { plusUntil: true },
    });
    const from = row.plusUntil !== null && row.plusUntil > new Date() ? row.plusUntil : new Date();
    const plusUntil = new Date(from.getTime() + days * 86_400_000);
    await this.prisma.customer.update({ where: { id: customerId }, data: { plusUntil } });
    return plusUntil;
  }

  async recordDeliveredOrder(customerId: string, total: number): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        orderCount: { increment: 1 },
        totalSpent: { increment: total },
        lastOrderAt: new Date(),
      },
    });
  }

  async setBlocked(id: string, blocked: boolean): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { blockedAt: blocked ? new Date() : null },
    });
  }

  async adjustBalance(id: string, delta: number): Promise<void> {
    await this.prisma.customer.update({
      where: { id },
      data: { balance: { increment: delta } },
    });
  }
}
