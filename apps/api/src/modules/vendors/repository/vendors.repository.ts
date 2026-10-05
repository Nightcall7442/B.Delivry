/**
 * Vendors persistence (Prisma). Tenant-scoped.
 */
import { GUARANTEE, type Role } from '@bazar/constants';
import type { Prisma, Vendor } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type {
  CreateVendorInput,
  PayoutSummary,
  VendorListFilters,
  VendorStatus,
} from '../types/index.js';

const VENDOR_INCLUDE = {
  _count: { select: { stores: true } },
} satisfies Prisma.VendorInclude;

export type VendorWithCounts = Prisma.VendorGetPayload<{ include: typeof VENDOR_INCLUDE }>;

export class VendorsRepository extends BaseRepository {
  async findById(id: string): Promise<VendorWithCounts | null> {
    return this.prisma.vendor.findFirst({ where: this.scoped({ id }), include: VENDOR_INCLUDE });
  }

  async findByUserId(userId: string): Promise<VendorWithCounts | null> {
    return this.prisma.vendor.findFirst({
      where: this.scoped({ userId }),
      include: VENDOR_INCLUDE,
    });
  }

  async list(filters: VendorListFilters): Promise<PaginatedResult<VendorWithCounts>> {
    const where: Prisma.VendorWhereInput = {
      ...this.tenantScope(),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.legalType !== undefined ? { legalType: filters.legalType } : {}),
      ...(filters.search !== undefined
        ? {
            OR: [
              { displayName: { contains: filters.search, mode: 'insensitive' as const } },
              { legalName: { contains: filters.search, mode: 'insensitive' as const } },
              { phone: { contains: filters.search } },
              { taxId: { contains: filters.search } },
            ],
          }
        : {}),
    };

    return this.page(
      filters,
      (page) =>
        this.prisma.vendor.findMany({
          where,
          include: VENDOR_INCLUDE,
          orderBy: { createdAt: 'desc' },
          ...page,
        }),
      () => this.prisma.vendor.count({ where }),
    );
  }

  async create(input: CreateVendorInput & { userId: string }): Promise<VendorWithCounts> {
    // The record is bound to a user by id: that user has to be someone of this tenant, or the desk of
    // one tenant could attach a vendor (a legal name, a bank account) to a person of another.
    this.found(
      await this.prisma.user.findFirst({
        where: this.scopedAlive({ id: input.userId }),
        select: { id: true },
      }),
      'User',
      input.userId,
    );
    return this.prisma.vendor.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        userId: input.userId,
        legalType: input.legalType,
        legalName: input.legalName,
        displayName: input.displayName,
        taxId: input.taxId ?? null,
        phone: input.phone,
        email: input.email ?? null,
        bankAccount: input.bankAccount ?? null,
      },
      include: VENDOR_INCLUDE,
    });
  }

  async update(id: string, data: Prisma.VendorUpdateInput): Promise<VendorWithCounts> {
    return this.prisma.vendor.update({
      where: { id, ...this.tenantScope() },
      data,
      include: VENDOR_INCLUDE,
    });
  }

  /** The roles of the user behind a vendor, to keep the desk's reach inside its rank. */
  async rolesOfUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    return rows.map((row) => row.role as Role);
  }

  /**
   * Approval and the VENDOR role go together, as a courier's verification and the COURIER role do:
   * an applicant from «Стать продавцом» is a customer until the desk says yes, and the role is what
   * lets them stock a stall in the seller app from their next token on.
   */
  async setStatus(
    id: string,
    status: VendorStatus,
    approval: { userId: string; grantedBy: string | null } | null = null,
  ): Promise<Vendor> {
    const update = this.prisma.vendor.update({
      where: { id, ...this.tenantScope() },
      data: { status, ...(status === 'ACTIVE' ? { verifiedAt: new Date() } : {}) },
    });
    if (status !== 'ACTIVE' || approval === null) return update;
    const [vendor] = await this.prisma.$transaction([
      update,
      this.prisma.userRole.upsert({
        where: { userId_role: { userId: approval.userId, role: 'VENDOR' } },
        update: {},
        create: { userId: approval.userId, role: 'VENDOR', grantedBy: approval.grantedBy },
      }),
    ]);
    return vendor;
  }

  /**
   * What the platform owes this vendor: the goods total of delivered orders, minus commission —
   * each order at the rate it was placed at (the vendor's own, else the tariff's; it used to be
   * the vendor's own or nothing, so a stall on the tariff was shown its whole subtotal).
   * Computed on demand rather than kept as a running column, because a wrong stored balance is
   * worse than a slightly slow query.
   *
   * Bazara's money-back guarantee, kept here: an order's money is the vendor's to take only once
   * the customer can no longer complain about it — the freshness window after delivery has passed
   * and no complaint about the order is open. Until then it is owed but on hold.
   */
  async pendingPayout(
    vendorId: string,
    since?: Date,
    now: Date = new Date(),
  ): Promise<PayoutSummary> {
    const windowMs = GUARANTEE.FRESHNESS_WINDOW_HOURS * 3_600_000;
    const cutoff = new Date(now.getTime() - windowMs);
    const delivered: Prisma.OrderWhereInput = {
      ...this.tenantScope(),
      status: 'DELIVERED',
      store: { vendorId },
      ...(since !== undefined ? { deliveredAt: { gte: since } } : {}),
    };
    const complained: Prisma.OrderWhereInput = {
      tickets: {
        some: {
          status: { in: ['OPEN', 'PENDING'] },
          topic: { in: ['ORDER_ISSUE', 'PRODUCT_QUALITY'] },
        },
      },
    };
    // One sum per rate: the rate is the order's, so the cut is taken rate by rate.
    const byRate = (where: Prisma.OrderWhereInput) =>
      this.prisma.order.groupBy({
        by: ['commissionPercent'],
        where,
        _sum: { subtotal: true },
        _count: { _all: true },
      });
    const [all, held, next] = await Promise.all([
      byRate(delivered),
      byRate({ ...delivered, OR: [{ deliveredAt: { gt: cutoff } }, complained] }),
      // When the first of the window-held orders clears; a complaint has no clock of its own.
      this.prisma.order.findFirst({
        where: { ...delivered, AND: [{ deliveredAt: { gt: cutoff } }], NOT: complained },
        orderBy: { deliveredAt: 'asc' },
        select: { deliveredAt: true },
      }),
    ]);

    type Rate = (typeof all)[number];
    const net = (rates: Rate[]) =>
      rates.reduce((sum, rate) => {
        const gross = rate._sum.subtotal ?? 0;
        return sum + gross - Math.round((gross * rate.commissionPercent) / 100);
      }, 0);
    const count = (rates: Rate[]) => rates.reduce((sum, rate) => sum + rate._count._all, 0);
    const pending = net(all);
    const onHold = net(held);

    return {
      vendorId,
      pending,
      available: pending - onHold,
      onHold,
      onHoldOrders: count(held),
      releasesAt:
        next?.deliveredAt === null || next?.deliveredAt === undefined
          ? null
          : new Date(next.deliveredAt.getTime() + windowMs).toISOString(),
      currency: 'UZS',
      orderCount: count(all),
    };
  }
}
