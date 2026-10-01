/**
 * Delivery persistence (Prisma). Tenant-scoped.
 */
import {
  DELIVERY_TIMEOUTS,
  NEIGHBOUR_COURIER,
  TERMINAL_ORDER_STATUSES,
  type DeliveryStatus,
} from '@bazar/constants';
import { boundingBox, haversineMeters } from '@bazar/maps';
import type { LatLng } from '@bazar/maps';
import type { Delivery, DeliveryOffer, Prisma } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CourierCandidate, CreateDeliveryInput, DeliveryListFilters } from '../types/index.js';

/** Statuses of a trip that is still the courier's to carry. */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'ASSIGNED',
  'AT_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DROPOFF',
];

/**
 * A trip whose order was cancelled or failed under the courier is over, whatever the delivery row
 * still says: it neither counts against the courier's capacity nor keeps them from going offline.
 */
const ORDER_STILL_OPEN = { order: { status: { notIn: [...TERMINAL_ORDER_STATUSES] } } };

/** What the dispatch rules need to know about a courier. */
export interface CourierStanding {
  id: string;
  userId: string;
  status: string;
  verifiedAt: Date | null;
  maxConcurrentOrders: number;
}

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

  /** A courier of this tenant, or null: an id from another tenant is not a courier here. */
  async findCourier(courierId: string): Promise<CourierStanding | null> {
    return this.prisma.courier.findFirst({
      where: this.scoped({ id: courierId }),
      select: { id: true, userId: true, status: true, verifiedAt: true, maxConcurrentOrders: true },
    });
  }

  async findOffer(deliveryId: string, courierId: string): Promise<DeliveryOffer | null> {
    return this.prisma.deliveryOffer.findFirst({
      where: { deliveryId, courierId, delivery: this.tenantScope() },
    });
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
      (page) =>
        this.prisma.delivery.findMany({
          where,
          // The trip list names the order and the stall, so a courier's history reads as history.
          include: { order: { select: { number: true, store: { select: { name: true } } } } },
          orderBy: { createdAt: 'desc' },
          ...page,
        }),
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
        // The desk verifies a courier before the first shift; an unverified account is never offered work.
        verifiedAt: { not: null },
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
              where: { status: { in: ACTIVE_DELIVERY_STATUSES }, ...ORDER_STILL_OPEN },
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
    await this.prisma.deliveryOffer.deleteMany({
      where: { deliveryId, acceptedAt: null, delivery: this.tenantScope() },
    });
  }

  /**
   * The offers this courier can still answer: unexpired, not declined, on a delivery nobody has taken.
   * The socket pushes them as they are made; this is what a courier whose socket was not listening reads.
   */
  async pendingOffersFor(
    courierId: string,
    now: Date,
  ): Promise<{ expiresAt: Date; delivery: Delivery }[]> {
    const offers = await this.prisma.deliveryOffer.findMany({
      where: {
        courierId,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: now },
        delivery: {
          ...this.tenantScope(),
          courierId: null,
          status: { in: ['PENDING', 'SEARCHING'] },
        },
      },
      include: { delivery: true },
      orderBy: { offeredAt: 'asc' },
    });
    return offers.map((offer) => ({ expiresAt: offer.expiresAt, delivery: offer.delivery }));
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
      where: {
        id: deliveryId,
        courierId: null,
        status: { in: ['PENDING', 'SEARCHING'] },
        ...this.tenantScope(),
      },
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

  /** Only an offer that is still open: an accepted one is the courier's trip now, not an offer to turn down. */
  async decline(deliveryId: string, courierId: string): Promise<void> {
    await this.prisma.deliveryOffer.updateMany({
      where: { deliveryId, courierId, acceptedAt: null, delivery: this.tenantScope() },
      data: { declinedAt: new Date() },
    });
  }

  /** Hands the trip back to the search; false when it is no longer this courier's, so nothing is reset. */
  async release(deliveryId: string, courierId: string): Promise<boolean> {
    const result = await this.prisma.delivery.updateMany({
      where: this.scoped({ id: deliveryId, courierId, status: { in: ACTIVE_DELIVERY_STATUSES } }),
      data: {
        courierId: null,
        status: 'SEARCHING',
        assignedAt: null,
        attemptCount: { increment: 1 },
      },
    });
    return result.count === 1;
  }

  /**
   * One step of the courier's own trip. The row moves only from the statuses the caller names and
   * only while it is still this courier's, so a repeated or late request matches nothing (false)
   * instead of reopening a finished trip or writing a second ending over the first.
   */
  async transition(
    deliveryId: string,
    courierId: string,
    from: readonly DeliveryStatus[],
    status: DeliveryStatus,
    extra: Prisma.DeliveryUncheckedUpdateManyInput = {},
  ): Promise<boolean> {
    const result = await this.prisma.delivery.updateMany({
      where: this.scoped({ id: deliveryId, courierId, status: { in: [...from] } }),
      data: { ...extra, status },
    });
    return result.count === 1;
  }

  async setSearching(deliveryId: string): Promise<void> {
    await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: 'PENDING', ...this.tenantScope() },
      data: { status: 'SEARCHING' },
    });
  }

  async setEta(deliveryId: string, etaAt: Date | null): Promise<void> {
    await this.prisma.delivery.updateMany({
      where: this.scoped({ id: deliveryId }),
      data: { etaAt },
    });
  }

  async setHandoverCode(deliveryId: string, code: string): Promise<void> {
    await this.prisma.delivery.updateMany({
      where: this.scoped({ id: deliveryId }),
      data: { handoverCode: code },
    });
  }

  /** Deliveries the courier is carrying right now, for their app home screen. */
  async activeForCourier(courierId: string): Promise<Delivery[]> {
    return this.prisma.delivery.findMany({
      where: {
        ...this.tenantScope(),
        courierId,
        status: { in: ACTIVE_DELIVERY_STATUSES },
        ...ORDER_STILL_OPEN,
      },
      orderBy: { assignedAt: 'asc' },
    });
  }
}
