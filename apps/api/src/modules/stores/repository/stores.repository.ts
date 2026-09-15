/**
 * Stores persistence (Prisma). Tenant-scoped.
 */
import { boundingBox, haversineMeters } from '@bazar/maps';
import type { Prisma, Store, StoreSchedule } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { ScheduleEntry, StoreListFilters } from '../types/index.js';

const STORE_INCLUDE = { schedule: true } satisfies Prisma.StoreInclude;

export type StoreWithSchedule = Store & { schedule: StoreSchedule[] };

export class StoresRepository extends BaseRepository {
  async findById(id: string): Promise<StoreWithSchedule | null> {
    return this.prisma.store.findFirst({
      where: this.scopedAlive({ id }),
      include: STORE_INCLUDE,
    });
  }

  async findBySlug(slug: string): Promise<StoreWithSchedule | null> {
    return this.prisma.store.findFirst({
      where: this.scopedAlive({ slug }),
      include: STORE_INCLUDE,
    });
  }

  async list(filters: StoreListFilters): Promise<PaginatedResult<StoreWithSchedule>> {
    const where = this.buildWhere(filters);
    return this.page(
      filters,
      (page) =>
        this.prisma.store.findMany({
          where,
          include: STORE_INCLUDE,
          orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
          ...page,
        }),
      () => this.prisma.store.count({ where }),
    );
  }

  /**
   * Nearby search in two steps: a bounding box that an index can serve, then
   * an exact distance filter in memory. Doing haversine in SQL would mean a
   * full scan of every store in the tenant on every map pan.
   */
  async findNearby(
    lat: number,
    lng: number,
    radiusMeters: number,
    filters: StoreListFilters,
  ): Promise<(StoreWithSchedule & { distanceMeters: number })[]> {
    const box = boundingBox({ lat, lng }, radiusMeters);

    const candidates = await this.prisma.store.findMany({
      where: {
        ...this.buildWhere(filters),
        lat: { gte: box.south, lte: box.north },
        lng: { gte: box.west, lte: box.east },
      },
      include: STORE_INCLUDE,
      take: 500,
    });

    return candidates
      .flatMap((store) => {
        if (store.lat === null || store.lng === null) return [];
        const distanceMeters = Math.round(
          haversineMeters({ lat, lng }, { lat: Number(store.lat), lng: Number(store.lng) }),
        );
        return distanceMeters <= radiusMeters ? [{ ...store, distanceMeters }] : [];
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  private buildWhere(filters: StoreListFilters): Prisma.StoreWhereInput {
    return {
      ...this.tenantScope(),
      deletedAt: null,
      // Customers only ever see ACTIVE stores; admin lists pass an explicit status.
      status: filters.status ?? 'ACTIVE',
      ...(filters.cityId !== undefined ? { cityId: filters.cityId } : {}),
      ...(filters.type !== undefined ? { type: filters.type } : {}),
      ...(filters.vendorId !== undefined ? { vendorId: filters.vendorId } : {}),
      ...(filters.categoryId !== undefined
        ? { products: { some: { categoryId: filters.categoryId, available: true } } }
        : {}),
      ...(filters.search !== undefined
        ? {
            OR: [
              { slug: { contains: filters.search, mode: 'insensitive' as const } },
              { address: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
  }

  async create(data: Prisma.StoreUncheckedCreateInput): Promise<StoreWithSchedule> {
    return this.prisma.store.create({ data, include: STORE_INCLUDE });
  }

  async update(id: string, data: Prisma.StoreUpdateInput): Promise<StoreWithSchedule> {
    return this.prisma.store.update({ where: { id }, data, include: STORE_INCLUDE });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CLOSED' },
    });
  }

  /** Replaces the whole week at once: a partial schedule is never meaningful. */
  async replaceSchedule(storeId: string, entries: readonly ScheduleEntry[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.storeSchedule.deleteMany({ where: { storeId } }),
      this.prisma.storeSchedule.createMany({
        data: entries.map((entry) => ({
          storeId,
          weekday: entry.weekday,
          opensAt: entry.opensAt,
          closesAt: entry.closesAt,
          closed: entry.closed,
        })),
      }),
    ]);
  }

  /** Recomputed from reviews rather than incremented, so it cannot drift. */
  async refreshRating(storeId: string): Promise<void> {
    const aggregate = await this.prisma.review.aggregate({
      where: { target: 'STORE', targetId: storeId, published: true },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        rating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count,
      },
    });
  }
}
