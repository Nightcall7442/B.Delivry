/**
 * Stores business logic. Store profiles, schedules, opening state, nearby search.
 */
import { PERMISSION, SEARCH_RADIUS } from '@bazar/constants';
import { slugify } from '@bazar/utils';
import { minutesOfDay, tashkentParts } from '@bazar/utils';
import { Prisma } from '@prisma/client';
import { TEMPLATE } from '@bazar/notifications';
import type { PrismaClient } from '@prisma/client';
import type { JobQueue } from '../../../infrastructure/redis/queue.js';
import { JOB, QUEUE } from '../../../jobs/queues.js';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ForbiddenError,
  NotFoundError,
  StoreClosedError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { StoresRepository, StoreWithSchedule } from '../repository/stores.repository.js';
import type { OpenStore, ScheduleEntry, StoreListFilters } from '../types/index.js';

export interface StoresServiceDeps extends ServiceDeps {
  repository: StoresRepository;
  prisma: PrismaClient;
  queue: JobQueue;
}

export class StoresService extends BaseService {
  private readonly repository: StoresRepository;

  private readonly prisma: PrismaClient;
  private readonly queue: JobQueue;

  constructor(deps: StoresServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.prisma = deps.prisma;
    this.queue = deps.queue;
  }

  /**
   * "Сегодня привезли": the vendor ticks what came in this morning; with
   * `announce`, everyone who ordered from the stall this season hears about
   * it — with a photo of the counter when there is one.
   */
  async markArrivals(
    storeId: string,
    input: { productIds: string[]; announce: boolean; photoUrl?: string | undefined },
  ): Promise<{ marked: number; notified: number }> {
    const store = await this.get(storeId);
    // A vendor only for their own stall; the desk (which owns no stall) for any.
    this.authorize(
      PERMISSION.STORE_WRITE,
      this.currentUser().vendorId !== undefined
        ? { vendorId: store.vendorId, tenantId: store.tenantId }
        : undefined,
    );
    const now = new Date();
    const products = await this.prisma.product.findMany({
      where: { id: { in: input.productIds }, storeId },
      select: { id: true, name: true },
    });
    await this.prisma.product.updateMany({
      where: { id: { in: products.map((row) => row.id) } },
      data: { arrivedAt: now },
    });
    if (!input.announce || products.length === 0) return { marked: products.length, notified: 0 };

    // The season's customers: anyone who ordered here in the last 60 days.
    const since = new Date(now.getTime() - 60 * 86_400_000);
    const buyers = await this.prisma.order.findMany({
      where: { storeId, placedAt: { gte: since } },
      distinct: ['customerId'],
      select: { customerId: true },
      take: 500,
    });
    const names = products
      .map(
        (row) =>
          (row.name as Record<string, string>)['ru'] ??
          Object.values(row.name as Record<string, string>)[0] ??
          '',
      )
      .filter(Boolean);
    const storeName = (store.name as Record<string, string>)['ru'] ?? '';
    const day = now.toISOString().slice(0, 10);
    for (const buyer of buyers) {
      await this.queue.enqueue(
        QUEUE.NOTIFICATIONS,
        JOB.SEND_NOTIFICATION,
        {
          tenantId: store.tenantId,
          userId: buyer.customerId,
          template: TEMPLATE.PROMO,
          params: { title: `Сегодня привезли — ${storeName}`, body: names.slice(0, 5).join(', ') },
          deepLink: `/stores/${storeId}`,
          ...(input.photoUrl !== undefined ? { imageUrl: input.photoUrl } : {}),
          idempotencyKey: `arrivals:${storeId}:${day}:${buyer.customerId}`,
        },
        { jobId: `arrivals:${storeId}:${day}:${buyer.customerId}` },
      );
    }
    return { marked: products.length, notified: buyers.length };
  }

  /**
   * A store is open when its status is ACTIVE and the local clock falls inside
   * today's schedule. A weekday with no schedule row means closed: a bazaar
   * stall that never set hours should not receive orders at 3am.
   */
  isOpen(store: StoreWithSchedule, at: Date = new Date()): boolean {
    if (store.status !== 'ACTIVE') return false;

    const { weekday } = tashkentParts(at);
    const today = store.schedule.find((entry) => entry.weekday === weekday);
    if (today === undefined || today.closed) return false;

    const minute = minutesOfDay(at);
    return minute >= today.opensAt && minute < today.closesAt;
  }

  async get(id: string): Promise<StoreWithSchedule> {
    const store = await this.repository.findById(id);
    if (store === null) throw new NotFoundError('Store', id);
    return store;
  }

  /**
   * What the order flow needs: the store exists, is open right now, and has a
   * map location a courier can be sent to. Every failure here is a reason the
   * order cannot be placed, so they are all raised as distinct errors.
   */
  async getOpenStore(id: string): Promise<OpenStore> {
    const store = await this.get(id);

    if (!this.isOpen(store)) throw new StoreClosedError(id);
    if (store.lat === null || store.lng === null) {
      throw new StoreClosedError(id);
    }

    return {
      id: store.id,
      vendorId: store.vendorId,
      name: store.name as Record<string, string>,
      cityId: store.cityId,
      lat: Number(store.lat),
      lng: Number(store.lng),
      preparationMinutes: store.preparationMinutes,
      currency: 'UZS',
    };
  }

  async list(input: StoreListFilters): Promise<PaginatedResult<StoreWithSchedule>> {
    let filters = input;
    if (input.mine === true) {
      const vendorId = this.currentUser().vendorId;
      if (vendorId === undefined) throw new ForbiddenError('Vendor profile required');
      filters = { ...input, vendorId };
    }
    if (filters.lat !== undefined && filters.lng !== undefined) {
      const radius = filters.radiusMeters ?? SEARCH_RADIUS.STORE_DEFAULT_METERS;
      const nearby = await this.repository.findNearby(filters.lat, filters.lng, radius, filters);
      const visible =
        filters.openNow === true ? nearby.filter((store) => this.isOpen(store)) : nearby;

      return {
        items: visible,
        pagination: {
          page: 1,
          pageSize: visible.length,
          total: visible.length,
          totalPages: 1,
          hasNext: false,
        },
      };
    }

    const result = await this.repository.list(filters);
    if (filters.openNow !== true) return result;

    return { ...result, items: result.items.filter((store) => this.isOpen(store)) };
  }

  async create(input: {
    vendorId: string;
    type: Prisma.StoreUncheckedCreateInput['type'];
    name: Record<string, string>;
    description?: Record<string, string>;
    phone?: string;
    cityId: string;
    address?: string;
    point?: { lat: number; lng: number };
    standNumber?: string;
    preparationMinutes?: number;
    schedule?: ScheduleEntry[];
  }): Promise<StoreWithSchedule> {
    this.authorize(PERMISSION.STORE_WRITE, { vendorId: input.vendorId });

    // Slug is generated once, from whichever name the seller gave first, and
    // never regenerated: links to a store must not break when it is renamed.
    const base = input.name.uz ?? input.name.ru ?? input.name.en ?? 'store';
    const slug = `${slugify(base)}-${Date.now().toString(36).slice(-4)}`;

    const store = await this.repository.create({
      tenantId: this.tenantId(),
      vendorId: input.vendorId,
      type: input.type,
      name: input.name as Prisma.InputJsonValue,
      // Spread rather than `?? undefined`: Prisma treats an explicitly
      // undefined Json column differently from an absent one.
      ...(input.description !== undefined
        ? { description: input.description as Prisma.InputJsonValue }
        : {}),
      slug,
      phone: input.phone ?? null,
      cityId: input.cityId,
      address: input.address ?? null,
      lat: input.point?.lat ?? null,
      lng: input.point?.lng ?? null,
      standNumber: input.standNumber ?? null,
      preparationMinutes: input.preparationMinutes ?? 15,
      status: 'PENDING_REVIEW',
    });

    if (input.schedule !== undefined) {
      await this.repository.replaceSchedule(store.id, input.schedule);
    }

    return this.get(store.id);
  }

  /** Paid placement: `days` more on top of whatever is left. Called by the payment handler. */
  async promote(id: string, days: number): Promise<Date> {
    const store = await this.get(id);
    const from =
      store.promotedUntil !== null && store.promotedUntil > new Date()
        ? store.promotedUntil
        : new Date();
    const promotedUntil = new Date(from.getTime() + days * 86_400_000);
    await this.repository.update(id, { promotedUntil });
    return promotedUntil;
  }

  async update(id: string, input: Record<string, unknown>): Promise<StoreWithSchedule> {
    const store = await this.get(id);
    this.authorize(PERMISSION.STORE_WRITE, { vendorId: store.vendorId, tenantId: store.tenantId });

    const data: Prisma.StoreUpdateInput = {
      ...(input.name !== undefined ? { name: input.name as Prisma.InputJsonValue } : {}),
      ...(input.description !== undefined
        ? { description: input.description as Prisma.InputJsonValue }
        : {}),
      ...(input.phone !== undefined ? { phone: input.phone as string } : {}),
      ...(input.address !== undefined ? { address: input.address as string } : {}),
      ...(input.standNumber !== undefined ? { standNumber: input.standNumber as string } : {}),
      ...(input.preparationMinutes !== undefined
        ? { preparationMinutes: input.preparationMinutes as number }
        : {}),
      ...(input.status !== undefined
        ? { status: input.status as NonNullable<Prisma.StoreUpdateInput['status']> }
        : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl as string | null } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl as string | null } : {}),
      ...(input.counterPhotoUrl !== undefined
        ? {
            counterPhotoUrl: input.counterPhotoUrl as string | null,
            counterPhotoAt: input.counterPhotoUrl === null ? null : new Date(),
          }
        : {}),
      ...(input.tags !== undefined ? { tags: input.tags as string[] } : {}),
      ...(input.ownerName !== undefined ? { ownerName: input.ownerName as string | null } : {}),
      ...(input.ownerSince !== undefined ? { ownerSince: input.ownerSince as number | null } : {}),
      ...(input.ownerPhotoUrl !== undefined
        ? { ownerPhotoUrl: input.ownerPhotoUrl as string | null }
        : {}),
      ...(input.ownerMotto !== undefined
        ? {
            ownerMotto:
              input.ownerMotto === null
                ? Prisma.JsonNull
                : (input.ownerMotto as Prisma.InputJsonValue),
          }
        : {}),
    };

    const point = input.point as { lat: number; lng: number } | undefined;
    if (point !== undefined) {
      data.lat = point.lat;
      data.lng = point.lng;
    }

    const updated = await this.repository.update(id, data);

    if (Array.isArray(input.schedule)) {
      await this.repository.replaceSchedule(id, input.schedule as ScheduleEntry[]);
      return this.get(id);
    }

    return updated;
  }

  async setSchedule(id: string, schedule: ScheduleEntry[]): Promise<StoreWithSchedule> {
    const store = await this.get(id);
    this.authorize(PERMISSION.STORE_WRITE, { vendorId: store.vendorId });
    await this.repository.replaceSchedule(id, schedule);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const store = await this.get(id);
    this.authorize(PERMISSION.STORE_WRITE, { vendorId: store.vendorId });
    // Soft delete: past orders still reference this store.
    await this.repository.softDelete(id);
  }

  async refreshRating(storeId: string): Promise<void> {
    await this.repository.refreshRating(storeId);
  }
}
