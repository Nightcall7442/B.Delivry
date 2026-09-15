/**
 * Couriers persistence (Prisma). Tenant-scoped.
 */
import { DELIVERY_TIMEOUTS, type CourierStatus } from '@bazar/constants';
import type { Courier, Prisma } from '@prisma/client';
import { NotFoundError } from '../../../common/errors/domain.errors.js';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CourierListFilters, RegisterCourierInput } from '../types/index.js';

const COURIER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, phone: true, avatarUrl: true } },
} satisfies Prisma.CourierInclude;

export type CourierWithUser = Prisma.CourierGetPayload<{ include: typeof COURIER_INCLUDE }>;

export class CouriersRepository extends BaseRepository {
  async findById(id: string): Promise<CourierWithUser | null> {
    return this.prisma.courier.findFirst({
      where: this.scoped({ id }),
      include: COURIER_INCLUDE,
    });
  }

  async findByUserId(userId: string): Promise<CourierWithUser | null> {
    return this.prisma.courier.findFirst({
      where: this.scoped({ userId }),
      include: COURIER_INCLUDE,
    });
  }

  async list(filters: CourierListFilters): Promise<PaginatedResult<CourierWithUser>> {
    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);

    const where: Prisma.CourierWhereInput = {
      ...this.tenantScope(),
      ...(filters.cityId !== undefined ? { cityId: filters.cityId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.vehicleType !== undefined ? { vehicleType: filters.vehicleType } : {}),
      // "Online" means reporting a position, not merely holding the status.
      ...(filters.onlineOnly === true
        ? { status: { in: ['ONLINE', 'BUSY'] }, lastLocationAt: { gte: staleBefore } }
        : {}),
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
        this.prisma.courier.findMany({
          where,
          include: COURIER_INCLUDE,
          orderBy: [{ status: 'asc' }, { rating: 'desc' }],
          ...page,
        }),
      () => this.prisma.courier.count({ where }),
    );
  }

  async create(input: RegisterCourierInput): Promise<CourierWithUser> {
    return this.prisma.courier.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        userId: input.userId,
        cityId: input.cityId,
        vehicleType: input.vehicleType,
        plateNumber: input.plateNumber ?? null,
        maxConcurrentOrders: input.maxConcurrentOrders ?? 1,
      },
      include: COURIER_INCLUDE,
    });
  }

  /**
   * Mahalla courier: a customer who will walk orders to neighbours. Home is
   * their delivery address; the COURIER role lets the courier app sign them in.
   */
  async createNeighbour(input: {
    userId: string;
    customerId: string;
    addressId: string;
    radiusMeters: number;
  }): Promise<CourierWithUser> {
    const address = await this.prisma.address.findFirst({
      where: { id: input.addressId, customerId: input.customerId },
      select: { cityId: true, lat: true, lng: true },
    });
    if (address === null || address.lat === null || address.lng === null) {
      throw new NotFoundError('Address with a map point', input.addressId);
    }
    const tenantId = this.tenantScope().tenantId;
    await this.prisma.userRole.upsert({
      where: { userId_role: { userId: input.userId, role: 'COURIER' } },
      update: {},
      create: { userId: input.userId, role: 'COURIER' },
    });
    return this.prisma.courier.create({
      data: {
        tenantId,
        userId: input.userId,
        cityId: address.cityId,
        vehicleType: 'FOOT',
        neighbour: true,
        homeLat: address.lat,
        homeLng: address.lng,
        homeRadiusMeters: input.radiusMeters,
      },
      include: COURIER_INCLUDE,
    });
  }

  async setStatus(id: string, status: CourierStatus): Promise<Courier> {
    return this.prisma.courier.update({ where: { id }, data: { status } });
  }

  async update(id: string, data: Prisma.CourierUpdateInput): Promise<CourierWithUser> {
    return this.prisma.courier.update({ where: { id }, data, include: COURIER_INCLUDE });
  }

  /** Recomputed from reviews, so it cannot drift out of step with them. */
  async refreshRating(courierId: string): Promise<void> {
    const aggregate = await this.prisma.review.aggregate({
      where: { target: 'COURIER', targetId: courierId, published: true },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.courier.update({
      where: { id: courierId },
      data: { rating: aggregate._avg.rating ?? 0, ratingCount: aggregate._count },
    });
  }

  async incrementCompleted(courierId: string): Promise<void> {
    await this.prisma.courier.update({
      where: { id: courierId },
      data: { completedOrders: { increment: 1 } },
    });
  }

  async incrementCancelled(courierId: string): Promise<void> {
    await this.prisma.courier.update({
      where: { id: courierId },
      data: { cancelledOrders: { increment: 1 } },
    });
  }

  /** Deliveries completed today and what they earned, for the shift screen. */
  async todayStats(courierId: string, since: Date): Promise<{ orders: number; earnings: number }> {
    const aggregate = await this.prisma.delivery.aggregate({
      where: { courierId, status: 'DELIVERED', deliveredAt: { gte: since } },
      _count: true,
      _sum: { payout: true },
    });

    return { orders: aggregate._count, earnings: aggregate._sum.payout ?? 0 };
  }

  async countOnline(cityId: string): Promise<number> {
    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);
    return this.prisma.courier.count({
      where: {
        ...this.tenantScope(),
        cityId,
        status: 'ONLINE',
        lastLocationAt: { gte: staleBefore },
      },
    });
  }
}
