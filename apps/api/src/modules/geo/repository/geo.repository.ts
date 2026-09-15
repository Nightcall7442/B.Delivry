/**
 * Geo persistence (Prisma). Tenant-scoped.
 */
import type { GeoLevel } from '@bazar/constants';
import type { DeliveryZone, GeoPlace, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import { toPolygon } from '../domain/geofence.js';
import type { PlaceInput, ZoneInput, ZoneUpdate, ZoneWithPolygon } from '../types/index.js';

/**
 * Geo data is reference data: shared by every tenant, changed by admins a few
 * times a year, read on every single checkout. Not tenant-scoped, and cached
 * hard by the service.
 */
export class GeoRepository extends BaseRepository {
  async listPlaces(level?: GeoLevel, parentId?: string): Promise<GeoPlace[]> {
    return this.prisma.geoPlace.findMany({
      where: {
        active: true,
        ...(level !== undefined ? { level } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async findPlace(id: string): Promise<GeoPlace | null> {
    return this.prisma.geoPlace.findUnique({ where: { id } });
  }

  /** Walks up the tree: mahalla to district to city to region. */
  async ancestors(id: string): Promise<GeoPlace[]> {
    const chain: GeoPlace[] = [];
    let current = await this.findPlace(id);

    // Depth is bounded by GEO_LEVEL (4), so the loop cannot run away.
    while (current !== null && chain.length < 8) {
      chain.push(current);
      if (current.parentId === null) break;
      current = await this.findPlace(current.parentId);
    }

    return chain;
  }

  async createPlace(input: PlaceInput): Promise<GeoPlace> {
    return this.prisma.geoPlace.create({
      data: {
        level: input.level,
        code: input.code,
        name: input.name as Prisma.InputJsonValue,
        parentId: input.parentId ?? null,
        centerLat: input.center?.lat ?? null,
        centerLng: input.center?.lng ?? null,
      },
    });
  }

  // ------------------------------------------------------------------ zones

  async listZones(cityId: string): Promise<ZoneWithPolygon[]> {
    const rows = await this.prisma.deliveryZone.findMany({
      where: { cityId, active: true },
      orderBy: { priority: 'desc' },
    });

    return rows.flatMap((row) => {
      const coordinates = toPolygon(row.polygon);
      // A zone with a broken polygon is dropped rather than throwing: one bad
      // row must not take down checkout for a whole city.
      if (coordinates === null) return [];
      return [
        {
          id: row.id,
          name: row.name,
          cityId: row.cityId,
          tariffId: row.tariffId,
          priority: row.priority,
          polygon: { type: 'Polygon' as const, coordinates },
        },
      ];
    });
  }

  async listAllZones(): Promise<ZoneWithPolygon[]> {
    const cities = await this.prisma.deliveryZone.findMany({
      where: { active: true },
      select: { cityId: true },
      distinct: ['cityId'],
    });

    const perCity = await Promise.all(cities.map((row) => this.listZones(row.cityId)));
    return perCity.flat();
  }

  async createZone(input: ZoneInput): Promise<DeliveryZone> {
    return this.prisma.deliveryZone.create({
      data: {
        name: input.name,
        cityId: input.cityId,
        polygon: input.polygon as unknown as Prisma.InputJsonValue,
        tariffId: input.tariffId,
        priority: input.priority ?? 0,
      },
    });
  }

  async updateZone(id: string, input: ZoneUpdate): Promise<DeliveryZone> {
    return this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.polygon !== undefined
          ? { polygon: input.polygon as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.tariffId !== undefined ? { tariffId: input.tariffId } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async deleteZone(id: string): Promise<void> {
    await this.prisma.deliveryZone.update({ where: { id }, data: { active: false } });
  }
}
