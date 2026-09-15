/**
 * Торг. A customer names a per-unit price for one product; the stall answers
 * with yes, no, or its own number. Yes makes that number the customer's
 * personal price for a day — the order pricing reads it, nothing else does.
 */
import { HAGGLE, PERMISSION, type Currency } from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { money } from '@bazar/payments';
import type { DiscountRequest, PrismaClient } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { JobQueue } from '../../../infrastructure/redis/queue.js';
import type { RealtimePublisher } from '../../../infrastructure/redis/realtime-events.js';
import { JOB, QUEUE } from '../../../jobs/queues.js';
import { room } from '../../../websocket/rooms.js';
import { WS_EVENT } from '@bazar/types';
import { toHaggleDto } from '../../../common/dto/index.js';

export interface HaggleServiceDeps extends ServiceDeps {
  prisma: PrismaClient;
  queue: JobQueue;
  realtime: RealtimePublisher;
}

export type HaggleRow = DiscountRequest & {
  product: { name: unknown; price: number; currency: string; storeId: string };
};

const INCLUDE = { product: { select: { name: true, price: true, currency: true, storeId: true } } };

export class HaggleService extends BaseService {
  private readonly prisma: PrismaClient;
  private readonly queue: JobQueue;
  private readonly realtime: RealtimePublisher;

  constructor(deps: HaggleServiceDeps) {
    super(deps);
    this.prisma = deps.prisma;
    this.queue = deps.queue;
    this.realtime = deps.realtime;
  }

  async ask(input: {
    productId: string;
    askedPrice: number;
    message?: string | undefined;
  }): Promise<HaggleRow> {
    const customerId = this.callerCustomerId();
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null, available: true },
      select: {
        id: true,
        storeId: true,
        price: true,
        currency: true,
        name: true,
        store: { select: { vendorId: true, name: true } },
      },
    });
    if (product === null) throw new NotFoundError('Product', input.productId);
    if (input.askedPrice >= product.price)
      throw new ConflictError('Ask for less than the list price');
    if (input.askedPrice < product.price * HAGGLE.MIN_SHARE) {
      throw new ConflictError('That is below half the price — the stall will not answer');
    }
    const open = await this.prisma.discountRequest.findFirst({
      where: {
        customerId,
        productId: product.id,
        status: { in: ['PENDING', 'ACCEPTED'] },
        expiresAt: { gt: new Date() },
      },
    });
    if (open !== null) throw new ConflictError('You already have an open ask for this product');

    const row = await this.prisma.discountRequest.create({
      data: {
        tenantId: this.tenantId(),
        customerId,
        storeId: product.storeId,
        productId: product.id,
        askedPrice: input.askedPrice,
        message: input.message ?? null,
        expiresAt: new Date(Date.now() + HAGGLE.ASK_TTL_HOURS * 3_600_000),
      },
      include: INCLUDE,
    });

    // The stall owner hears about it; the vendor's user id is the notification target.
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: product.store.vendorId },
      select: { userId: true },
    });
    if (vendor !== null) {
      const name = (product.name as Record<string, string>)['ru'] ?? '';
      await this.queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, {
        tenantId: row.tenantId,
        userId: vendor.userId,
        template: TEMPLATE.PROMO,
        params: {
          title: 'Просят скидку',
          body: `${name}: ${input.askedPrice / 100} вместо ${product.price / 100} сум${input.message ? ` — «${input.message}»` : ''}`,
        },
        deepLink: `/stores/${product.storeId}`,
        idempotencyKey: `notify:haggle:${row.id}`,
      });
    }
    return row;
  }

  /** The customer's own asks, open or recently answered. */
  async mine(): Promise<HaggleRow[]> {
    const customerId = this.callerCustomerId();
    return this.prisma.discountRequest.findMany({
      where: { customerId, expiresAt: { gt: new Date(Date.now() - 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
  }

  /** What a stall has on the table. Vendors see their own stalls; the desk any. */
  async forStore(storeId: string): Promise<HaggleRow[]> {
    await this.assertStoreAccess(storeId);
    return this.prisma.discountRequest.findMany({
      where: {
        storeId,
        OR: [
          { status: 'PENDING', expiresAt: { gt: new Date() } },
          { status: { in: ['ACCEPTED', 'DECLINED'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: INCLUDE,
    });
  }

  async answer(
    id: string,
    input: { accept: boolean; price?: number | undefined; reply?: string | undefined },
  ): Promise<HaggleRow> {
    const row = await this.prisma.discountRequest.findFirst({
      where: { id, tenantId: this.tenantId() },
      include: INCLUDE,
    });
    if (row === null) throw new NotFoundError('Discount request', id);
    await this.assertStoreAccess(row.storeId);
    if (row.status !== 'PENDING') throw new ConflictError('Already answered');

    const offeredPrice = input.accept ? (input.price ?? row.askedPrice) : null;
    if (offeredPrice !== null && offeredPrice > row.product.price) {
      throw new ConflictError('A counter above the list price is not a discount');
    }
    const updated = await this.prisma.discountRequest.update({
      where: { id },
      data: {
        status: input.accept ? 'ACCEPTED' : 'DECLINED',
        offeredPrice,
        reply: input.reply ?? null,
        expiresAt: input.accept
          ? new Date(Date.now() + HAGGLE.PRICE_TTL_HOURS * 3_600_000)
          : row.expiresAt,
      },
      include: INCLUDE,
    });

    const dto = toHaggleDto(updated);
    await this.realtime.emit(room.customer(updated.customerId), WS_EVENT.HAGGLE_ANSWERED, dto);
    const name = (updated.product.name as Record<string, string>)['ru'] ?? '';
    await this.queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, {
      tenantId: updated.tenantId,
      userId: updated.customerId,
      template: TEMPLATE.PROMO,
      params: input.accept
        ? {
            title: 'Продавец согласен',
            body: `${name} — ${(offeredPrice ?? 0) / 100} сум для вас до завтра${input.reply ? `: «${input.reply}»` : ''}`,
          }
        : {
            title: 'Скидки не будет',
            body: `${name}: продавец не уступил${input.reply ? ` — «${input.reply}»` : ''}`,
          },
      deepLink: `/stores/${updated.storeId}`,
      idempotencyKey: `notify:haggle-answer:${updated.id}`,
    });
    return updated;
  }

  /** Personal prices for the order pricing: productId → per-unit minor price. */
  async agreedPrices(customerId: string, productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.discountRequest.findMany({
      where: {
        customerId,
        productId: { in: productIds },
        status: 'ACCEPTED',
        expiresAt: { gt: new Date() },
      },
      select: { productId: true, offeredPrice: true },
    });
    return new Map(
      rows.flatMap((row) => (row.offeredPrice === null ? [] : [[row.productId, row.offeredPrice]])),
    );
  }

  private async assertStoreAccess(storeId: string): Promise<void> {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: this.tenantId() },
      select: { vendorId: true, tenantId: true },
    });
    if (store === null) throw new NotFoundError('Store', storeId);
    this.authorize(
      PERMISSION.STORE_WRITE,
      this.currentUser().vendorId !== undefined
        ? { vendorId: store.vendorId, tenantId: store.tenantId }
        : undefined,
    );
  }

  private callerCustomerId(): string {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    return user.customerId;
  }

  /** Money helper for callers that hold a row. */
  static price(minor: number, currency: string) {
    return money(minor, currency as Currency);
  }
}
