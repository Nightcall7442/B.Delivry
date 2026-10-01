/**
 * Couriers persistence (Prisma). Tenant-scoped.
 */
import { DELIVERY_TIMEOUTS, type CourierStatus, type Role } from '@bazar/constants';
import type { Courier, Prisma } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../../common/errors/domain.errors.js';
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
    // The profile is bound to a user by id: that user has to be someone of this tenant, or the desk
    // of one tenant could attach a courier row to a person of another.
    this.found(
      await this.prisma.user.findFirst({
        where: this.scopedAlive({ id: input.userId }),
        select: { id: true },
      }),
      'User',
      input.userId,
    );
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
   * Mahalla courier: a customer who will walk orders to neighbours. Home is their delivery address.
   * Only the profile is made here, and it cannot work yet: the COURIER role and the right to go online
   * come with verify(), once the desk has looked at the person. (The role used to be granted here, so
   * an applicant held courier rights before anyone had checked them.)
   */
  async createNeighbour(input: {
    userId: string;
    customerId: string;
    addressId: string;
    radiusMeters: number;
  }): Promise<CourierWithUser> {
    const tenantId = this.tenantScope().tenantId;
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, userId: input.userId, tenantId },
      select: { blockedAt: true },
    });
    if (customer === null || customer.blockedAt !== null) {
      throw new ForbiddenError('Customer profile required');
    }
    const address = await this.prisma.address.findFirst({
      where: { id: input.addressId, customerId: input.customerId, tenantId, deletedAt: null },
      select: { cityId: true, lat: true, lng: true },
    });
    if (address === null || address.lat === null || address.lng === null) {
      throw new NotFoundError('Address with a map point', input.addressId);
    }
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

  /**
   * The desk's yes: the account may go online, and the user gets the COURIER role the courier app
   * signs them in with (granted here and only here; a repeat changes nothing). One transaction, so
   * there is never a verified courier without the role or the role without the verification.
   */
  async verify(
    id: string,
    userId: string,
    verifiedAt: Date,
    grantedBy: string | null,
  ): Promise<CourierWithUser> {
    const [courier] = await this.prisma.$transaction([
      this.prisma.courier.update({
        where: { id, ...this.tenantScope() },
        data: { verifiedAt },
        include: COURIER_INCLUDE,
      }),
      this.prisma.userRole.upsert({
        where: { userId_role: { userId, role: 'COURIER' } },
        update: {},
        create: { userId, role: 'COURIER', grantedBy },
      }),
    ]);
    return courier;
  }

  /** The roles a courier's user holds, to keep the desk's reach inside its rank. */
  async rolesOfUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    return rows.map((row) => row.role as Role);
  }

  async setStatus(id: string, status: CourierStatus): Promise<Courier> {
    return this.prisma.courier.update({ where: { id, ...this.tenantScope() }, data: { status } });
  }

  /**
   * The courier going on or off shift. The write itself refuses a suspended courier, and an
   * unverified one anything but OFFLINE: a check made earlier in the request is not enough, because
   * the desk can suspend in between and this would write ONLINE over SUSPENDED. False when refused.
   */
  async setOwnStatus(id: string, status: CourierStatus): Promise<boolean> {
    const { count } = await this.prisma.courier.updateMany({
      where: {
        id,
        ...this.tenantScope(),
        status: { not: 'SUSPENDED' },
        ...(status === 'OFFLINE' ? {} : { verifiedAt: { not: null } }),
      },
      data: { status },
    });
    return count === 1;
  }

  async update(id: string, data: Prisma.CourierUpdateInput): Promise<CourierWithUser> {
    return this.prisma.courier.update({
      where: { id, ...this.tenantScope() },
      data,
      include: COURIER_INCLUDE,
    });
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
