/**
 * Delivery persistence (Prisma). Tenant-scoped.
 */
import { DELIVERY_TIMEOUTS, NEIGHBOUR_COURIER } from '@bazar/constants';
import { boundingBox, haversineMeters } from '@bazar/maps';
import type { LatLng } from '@bazar/maps';
import type { Delivery, Prisma } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CourierCandidate, CreateDeliveryInput, DeliveryListFilters } from '../types/index.js';

export class DeliveryRepository extends BaseRepository {
  async create(input: CreateDeliveryInput): Promise<Delivery> {
    return this.prisma.delivery.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        orderId: input.orderId,
        pickupLat: input.pickup?.lat ?? null,
        pickupLng: input.pickup?.lng ?? null,
        pickupAddress: input.pickupAddress,
        dropoffLat: input.dropoff?.lat ?? null,
        dropoffLng: input.dropoff?.lng ?? null,
        dropoffAddress: input.dropoffAddress,
        distanceMeters: input.distanceMeters,
        payout: input.payout,
        currency: input.currency,
      },
    });
  }

  async findById(id: string): Promise<Delivery | null> {
    return this.prisma.delivery.findFirst({ where: this.scoped({ id }) });
  }

  async findByOrder(orderId: string): Promise<Delivery | null> {
    return this.prisma.delivery.findFirst({ where: this.scoped({ orderId }) });
  }

  async list(filters: DeliveryListFilters): Promise<PaginatedResult<Delivery>> {
    const where: Prisma.DeliveryWhereInput = {
      ...this.tenantScope(),
      ...(filters.courierId !== undefined ? { courierId: filters.courierId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.from !== undefined || filters.to !== undefined
        ? {
            createdAt: {
              ...(filters.from !== undefined ? { gte: filters.from } : {}),
              ...(filters.to !== undefined ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };

    return this.page(
      filters,
      (page) => this.prisma.delivery.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => this.prisma.delivery.count({ where }),
    );
  }

  /**
   * Couriers who could take this order: online, in the box around the pickup,
   * and seen recently. Distance is filtered exactly afterwards, in memory,
   * because the box is what an index can serve.
   */
  async findCandidates(
    pickup: LatLng,
    radiusMeters: number,
    cityId: string,
  ): Promise<CourierCandidate[]> {
    const box = boundingBox(pickup, radiusMeters);
    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);

    const rows = await this.prisma.courier.findMany({
      where: {
        ...this.tenantScope(),
        cityId,
        status: 'ONLINE',
        lastLocationAt: { gte: staleBefore },
        lastLat: { gte: box.south, lte: box.north },
        lastLng: { gte: box.west, lte: box.east },
      },
      select: {
        id: true,
        lastLat: true,
        lastLng: true,
        lastLocationAt: true,
        vehicleType: true,
        rating: true,
        maxConcurrentOrders: true,
        neighbour: true,
        homeLat: true,
        homeLng: true,
        homeRadiusMeters: true,
        _count: {
          select: {
            deliveries: {
              where: {
                status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF'] },
              },
            },
          },
        },
      },
      take: 200,
    });

    return rows.flatMap((row) => {
      if (row.lastLat === null || row.lastLng === null || row.lastLocationAt === null) return [];
      const point = { lat: Number(row.lastLat), lng: Number(row.lastLng) };
      const distanceMeters = Math.round(haversineMeters(pickup, point));
      if (distanceMeters > radiusMeters) return [];

      return [
        {
          courierId: row.id,
          point,
          vehicleType: row.vehicleType,
          rating: row.rating,
          activeOrderCount: row._count.deliveries,
          maxConcurrentOrders: row.maxConcurrentOrders,
          distanceMeters,
          lastSeenAt: row.lastLocationAt,
          home:
            row.neighbour && row.homeLat !== null && row.homeLng !== null
              ? {
                  point: { lat: Number(row.homeLat), lng: Number(row.homeLng) },
                  radiusMeters: row.homeRadiusMeters ?? NEIGHBOUR_COURIER.HOME_RADIUS_METERS,
                }
              : null,
        },
      ];
    });
  }

  async recordOffer(deliveryId: string, courierId: string, expiresAt: Date): Promise<void> {
    await this.prisma.deliveryOffer.upsert({
      where: { deliveryId_courierId: { deliveryId, courierId } },
      create: { deliveryId, courierId, expiresAt },
      update: { offeredAt: new Date(), expiresAt, declinedAt: null },
    });
  }

  /** Forget who was asked: a restarted search may knock on the same doors. */
  async clearOffers(deliveryId: string): Promise<void> {
    await this.prisma.deliveryOffer.deleteMany({ where: { deliveryId, acceptedAt: null } });
  }

  async offeredCourierIds(deliveryId: string): Promise<string[]> {
    const offers = await this.prisma.deliveryOffer.findMany({
      where: { deliveryId },
      select: { courierId: true },
    });
    return offers.map((offer) => offer.courierId);
  }

  /**
   * Claims the delivery for one courier. The status guard is the whole point:
   * two couriers tapping accept at the same moment, and only one update
   * matches a delivery that is still unassigned.
   */
  async claim(deliveryId: string, courierId: string, tx?: PrismaTransaction): Promise<boolean> {
    const result = await this.client(tx).delivery.updateMany({
      where: { id: deliveryId, courierId: null, status: { in: ['PENDING', 'SEARCHING'] } },
      data: { courierId, status: 'ASSIGNED', assignedAt: new Date() },
    });

    if (result.count === 1) {
      await this.client(tx).deliveryOffer.updateMany({
        where: { deliveryId, courierId },
        data: { acceptedAt: new Date() },
      });
    }

    return result.count === 1;
  }

  async decline(deliveryId: string, courierId: string): Promise<void> {
    await this.prisma.deliveryOffer.updateMany({
      where: { deliveryId, courierId },
      data: { declinedAt: new Date() },
    });
  }

  async release(deliveryId: string): Promise<void> {
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        courierId: null,
        status: 'SEARCHING',
        assignedAt: null,
        attemptCount: { increment: 1 },
      },
    });
  }

  async setStatus(
    deliveryId: string,
    status: NonNullable<Prisma.DeliveryUpdateInput['status']>,
    extra: Prisma.DeliveryUpdateInput = {},
  ): Promise<Delivery> {
    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status, ...extra },
    });
  }

  async setSearching(deliveryId: string): Promise<void> {
    await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: 'PENDING' },
      data: { status: 'SEARCHING' },
    });
  }

  async setEta(deliveryId: string, etaAt: Date | null): Promise<void> {
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { etaAt } });
  }

  async setHandoverCode(deliveryId: string, code: string): Promise<void> {
    await this.prisma.delivery.update({ where: { id: deliveryId }, data: { handoverCode: code } });
  }

  /** Deliveries the courier is carrying right now, for their app home screen. */
  async activeForCourier(courierId: string): Promise<Delivery[]> {
    return this.prisma.delivery.findMany({
      where: {
        ...this.tenantScope(),
        courierId,
        status: { in: ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF'] },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }
}
