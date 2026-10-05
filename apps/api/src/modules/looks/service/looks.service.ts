/**
 * «Покажите товар». A customer asks the stall for a photograph of one good as it lies on the counter
 * now; the seller shoots it and the customer hears at once, the photo in the push. The photo then
 * shows on the good's page for everyone while it is fresh — one buyer's question answers the next.
 */
import { LOOK, PERMISSION } from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import type { LivePhotoDto } from '@bazar/types';
import type { PrismaClient, ProductLook } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { JobQueue } from '../../../infrastructure/redis/queue.js';
import { JOB, QUEUE } from '../../../jobs/queues.js';
import {
  currentViewer,
  purchasableStoreWhere,
  visibleProductWhere,
} from '../../catalog/domain/visibility.js';

export interface LooksServiceDeps extends ServiceDeps {
  prisma: PrismaClient;
  queue: JobQueue;
}

export type LookRow = ProductLook & { product: { name: unknown } };

const INCLUDE = { product: { select: { name: true } } };
const ruName = (name: unknown): string => (name as Record<string, string>)['ru'] ?? '';

export class LooksService extends BaseService {
  private readonly prisma: PrismaClient;
  private readonly queue: JobQueue;

  constructor(deps: LooksServiceDeps) {
    super(deps);
    this.prisma = deps.prisma;
    this.queue = deps.queue;
  }

  /**
   * Asks the stall for a photo. Asking again for the same good while the first ask waits is the same
   * ask; a customer keeps at most `LOOK.MAX_WAITING` waiting at once.
   */
  async ask(productId: string): Promise<LookRow> {
    const customerId = this.callerCustomerId();
    const now = new Date();
    const product = await this.prisma.product.findFirst({
      // On sale in a stall the public may buy from: the same window the shelf shows.
      where: {
        id: productId,
        tenantId: this.tenantId(),
        deletedAt: null,
        available: true,
        store: purchasableStoreWhere(),
      },
      select: { id: true, storeId: true, name: true, store: { select: { vendorId: true } } },
    });
    if (product === null) throw new NotFoundError('Product', productId);

    const waiting = { customerId, photoUrl: null, expiresAt: { gt: now } };
    const same = await this.prisma.productLook.findFirst({
      where: { ...waiting, productId },
      include: INCLUDE,
    });
    if (same !== null) return same;
    if ((await this.prisma.productLook.count({ where: waiting })) >= LOOK.MAX_WAITING) {
      throw new ConflictError('Wait for the stalls to answer the photos you asked for');
    }

    const row = await this.prisma.productLook.create({
      data: {
        tenantId: this.tenantId(),
        customerId,
        storeId: product.storeId,
        productId: product.id,
        expiresAt: new Date(now.getTime() + LOOK.ASK_TTL_MINUTES * 60_000),
      },
      include: INCLUDE,
    });

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: product.store.vendorId },
      select: { userId: true },
    });
    if (vendor !== null) {
      await this.queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, {
        tenantId: row.tenantId,
        userId: vendor.userId,
        template: TEMPLATE.PROMO,
        params: {
          title: 'Покажите товар',
          body: `${ruName(product.name)}: покупатель просит живое фото — снимите с прилавка`,
        },
        deepLink: `/stores/${product.storeId}`,
        idempotencyKey: `notify:look:${row.id}`,
      });
    }
    return row;
  }

  /** The customer's own asks of the last day, newest first. */
  async mine(productId?: string): Promise<LookRow[]> {
    const customerId = this.callerCustomerId();
    return this.prisma.productLook.findMany({
      where: {
        customerId,
        ...(productId !== undefined ? { productId } : {}),
        createdAt: { gt: new Date(Date.now() - 86_400_000) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: INCLUDE,
    });
  }

  /** What a stall is asked to show: the waiting asks, and its answers of the last day. */
  async forStore(storeId: string): Promise<LookRow[]> {
    await this.assertStoreAccess(storeId);
    const now = new Date();
    return this.prisma.productLook.findMany({
      where: {
        storeId,
        OR: [
          { photoUrl: null, expiresAt: { gt: now } },
          { answeredAt: { gt: new Date(now.getTime() - 86_400_000) } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: INCLUDE,
    });
  }

  /**
   * The stall's photo. Taken late is still taken — the good shows it either way — but an ask is
   * answered once: of two phones at one stall, the first photo stands.
   */
  async answer(id: string, photoUrl: string): Promise<LookRow> {
    const row = await this.prisma.productLook.findFirst({
      where: { id, tenantId: this.tenantId() },
      include: INCLUDE,
    });
    if (row === null) throw new NotFoundError('Look', id);
    await this.assertStoreAccess(row.storeId);
    const answeredAt = new Date();
    const { count } = await this.prisma.productLook.updateMany({
      where: { id, photoUrl: null },
      data: { photoUrl, answeredAt },
    });
    if (count === 0) throw new ConflictError('Already answered');

    await this.queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, {
      tenantId: row.tenantId,
      userId: row.customerId,
      template: TEMPLATE.PROMO,
      params: {
        title: 'Продавец показал товар',
        body: `${ruName(row.product.name)} — фото с прилавка, только что`,
      },
      imageUrl: photoUrl,
      deepLink: `/product/${row.productId}`,
      idempotencyKey: `notify:look-answer:${row.id}`,
    });
    return { ...row, photoUrl, answeredAt, updatedAt: answeredAt };
  }

  /**
   * The good's fresh photos from the stall, newest first: what anyone who may see the good sees.
   * A hidden good has none — the same NotFound its page gives.
   */
  async livePhotos(productId: string): Promise<LivePhotoDto[]> {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: this.tenantId(),
        deletedAt: null,
        AND: [visibleProductWhere(currentViewer(), { soldOutToo: true })],
      },
      select: { id: true },
    });
    if (product === null) throw new NotFoundError('Product', productId);
    const rows = await this.prisma.productLook.findMany({
      where: {
        productId,
        answeredAt: { gt: new Date(Date.now() - LOOK.FRESH_HOURS * 3_600_000) },
      },
      orderBy: { answeredAt: 'desc' },
      take: 3,
      select: { photoUrl: true, answeredAt: true },
    });
    return rows.flatMap((row) =>
      row.photoUrl === null || row.answeredAt === null
        ? []
        : [{ url: row.photoUrl, takenAt: row.answeredAt.toISOString() }],
    );
  }

  private async assertStoreAccess(storeId: string): Promise<void> {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: this.tenantId() },
      select: { vendorId: true, tenantId: true },
    });
    if (store === null) throw new NotFoundError('Store', storeId);
    // The desk is whoever may read every order; a token without a vendorId is not that.
    const staff = this.currentUser().permissions.includes(PERMISSION.ORDER_READ_ANY);
    this.authorize(
      PERMISSION.STORE_WRITE,
      staff ? undefined : { vendorId: store.vendorId, tenantId: store.tenantId },
    );
  }

  private callerCustomerId(): string {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    return user.customerId;
  }
}
