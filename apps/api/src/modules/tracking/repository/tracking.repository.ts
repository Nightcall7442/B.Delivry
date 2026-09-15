/**
 * Tracking persistence (Prisma). Tenant-scoped.
 */
import type { CourierPublicDto } from '@bazar/types';
import { maskPhone } from '@bazar/utils';
import type { CourierLocation, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { HistoryFilters, LocationPing } from '../types/index.js';

export class TrackingRepository extends BaseRepository {
  /**
   * Two writes per batch: the history rows, and the denormalized last fix on
   * the courier. The live map reads only the second one, so a map refresh
   * never scans the time-series table.
   */
  async savePings(courierId: string, pings: LocationPing[]): Promise<void> {
    if (pings.length === 0) return;

    const rows: Prisma.CourierLocationCreateManyInput[] = pings.map((ping) => ({
      courierId,
      orderId: ping.orderId ?? null,
      lat: ping.lat,
      lng: ping.lng,
      heading: ping.heading ?? null,
      speedKmh: ping.speedKmh ?? null,
      accuracyMeters: ping.accuracyMeters ?? null,
      recordedAt: ping.recordedAt,
    }));

    // Pings arrive out of order, so the newest by device clock wins.
    const latest = pings.reduce((newest, ping) =>
      ping.recordedAt > newest.recordedAt ? ping : newest,
    );

    await this.prisma.$transaction([
      this.prisma.courierLocation.createMany({ data: rows }),
      this.prisma.courier.update({
        where: { id: courierId },
        data: {
          lastLat: latest.lat,
          lastLng: latest.lng,
          lastLocationAt: latest.recordedAt,
        },
      }),
    ]);
  }

  /** What the customer may know about the person bringing the order. */
  async courierProfile(courierId: string): Promise<CourierPublicDto | null> {
    const courier = await this.prisma.courier.findFirst({
      where: this.scoped({ id: courierId }),
      select: {
        id: true,
        rating: true,
        vehicleType: true,
        plateNumber: true,
        neighbour: true,
        user: { select: { firstName: true, avatarUrl: true, phone: true } },
      },
    });
    if (courier === null) return null;
    return {
      id: courier.id,
      firstName: courier.user.firstName ?? 'Курьер',
      avatarUrl: courier.user.avatarUrl,
      rating: courier.rating,
      vehicleType: courier.vehicleType,
      plateNumber: courier.plateNumber,
      phone: maskPhone(courier.user.phone),
      neighbour: courier.neighbour,
    };
  }

  async lastLocation(courierId: string): Promise<{ lat: number; lng: number; at: Date } | null> {
    const courier = await this.prisma.courier.findFirst({
      where: this.scoped({ id: courierId }),
      select: { lastLat: true, lastLng: true, lastLocationAt: true },
    });

    if (courier?.lastLat == null || courier.lastLng == null || courier.lastLocationAt === null) {
      return null;
    }

    return {
      lat: Number(courier.lastLat),
      lng: Number(courier.lastLng),
      at: courier.lastLocationAt,
    };
  }

  async history(filters: HistoryFilters): Promise<CourierLocation[]> {
    return this.prisma.courierLocation.findMany({
      where: {
        ...(filters.orderId !== undefined ? { orderId: filters.orderId } : {}),
        ...(filters.courierId !== undefined ? { courierId: filters.courierId } : {}),
        ...(filters.from !== undefined || filters.to !== undefined
          ? {
              recordedAt: {
                ...(filters.from !== undefined ? { gte: filters.from } : {}),
                ...(filters.to !== undefined ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { recordedAt: 'asc' },
      take: Math.min(filters.limit ?? 500, 2000),
    });
  }

  /** Retention sweep: raw pings are only interesting while a dispute is fresh. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.prisma.courierLocation.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });
    return result.count;
  }

  /** Couriers currently on the map for a city, for the operator dashboard. */
  async liveCouriers(cityId: string, staleBefore: Date) {
    return this.prisma.courier.findMany({
      where: {
        ...this.tenantScope(),
        cityId,
        status: { in: ['ONLINE', 'BUSY'] },
        lastLocationAt: { gte: staleBefore },
      },
      select: {
        id: true,
        status: true,
        vehicleType: true,
        lastLat: true,
        lastLng: true,
        lastLocationAt: true,
      },
      take: 500,
    });
  }
}
