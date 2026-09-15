/**
 * Vendors persistence (Prisma). Tenant-scoped.
 */
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

  async create(input: CreateVendorInput): Promise<VendorWithCounts> {
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
    return this.prisma.vendor.update({ where: { id }, data, include: VENDOR_INCLUDE });
  }

  async setStatus(id: string, status: VendorStatus): Promise<Vendor> {
    return this.prisma.vendor.update({
      where: { id },
      data: { status, ...(status === 'ACTIVE' ? { verifiedAt: new Date() } : {}) },
    });
  }

  /**
   * What the platform owes this vendor: the goods total of delivered orders,
   * minus commission. Computed on demand rather than kept as a running column,
   * because a wrong stored balance is worse than a slightly slow query.
   */
  async pendingPayout(vendorId: string, since?: Date): Promise<PayoutSummary> {
    const aggregate = await this.prisma.order.aggregate({
      where: {
        ...this.tenantScope(),
        status: 'DELIVERED',
        store: { vendorId },
        ...(since !== undefined ? { deliveredAt: { gte: since } } : {}),
      },
      _sum: { subtotal: true },
      _count: true,
    });

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { commissionPercent: true },
    });

    const gross = aggregate._sum.subtotal ?? 0;
    const commission = Math.round((gross * (vendor?.commissionPercent ?? 0)) / 100);

    return {
      vendorId,
      pending: gross - commission,
      currency: 'UZS',
      orderCount: aggregate._count,
    };
  }
}
