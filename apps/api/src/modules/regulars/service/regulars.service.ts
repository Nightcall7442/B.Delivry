/**
 * «Свой продавец». The stall, on an order it holds, sees how many times this customer came back,
 * what they take and what they asked for — and keeps a note of its own about them. Only through an
 * order: a stall cannot look up a stranger, and it learns nothing it was not already told on its
 * own orders (no phone, no address). The customer, on a stall's page, sees that they are known
 * there and can take the last order again.
 */
import { ORDER_STATUS } from '@bazar/constants';
import type { MyStallDto, RegularDto } from '@bazar/types';
import type { PrismaClient } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/domain.errors.js';
import { standingOn } from '../../orders/domain/order-party.js';
import { usualOf, wishesOf } from '../domain/regular.js';

export interface RegularsServiceDeps extends ServiceDeps {
  prisma: PrismaClient;
}

/** How far back the stall's memory reads. */
const HISTORY = 50;

export class RegularsService extends BaseService {
  private readonly prisma: PrismaClient;

  constructor(deps: RegularsServiceDeps) {
    super(deps);
    this.prisma = deps.prisma;
  }

  /** The customer of this order as the order's stall knows them. */
  async forOrder(orderId: string): Promise<RegularDto> {
    const order = await this.stallOrder(orderId);
    const delivered = {
      tenantId: this.tenantId(),
      storeId: order.storeId,
      customerId: order.customerId,
      status: ORDER_STATUS.DELIVERED,
      id: { not: order.id },
    };
    const [count, first, history, note] = await Promise.all([
      this.prisma.order.count({ where: delivered }),
      this.prisma.order.findFirst({
        where: delivered,
        orderBy: { placedAt: 'asc' },
        select: { placedAt: true },
      }),
      this.prisma.order.findMany({
        where: delivered,
        orderBy: { placedAt: 'desc' },
        take: HISTORY,
        select: { items: { select: { productId: true, name: true, comment: true } } },
      }),
      this.prisma.storeCustomerNote.findUnique({
        where: {
          storeId_customerId: { storeId: order.storeId, customerId: order.customerId },
        },
        select: { note: true },
      }),
    ]);
    return {
      previousOrders: count,
      since: first === null ? null : first.placedAt.toISOString(),
      usual: usualOf(history),
      wishes: wishesOf(history),
      note: note?.note ?? null,
    };
  }

  /** The stall's note about the customer of this order; an empty one forgets it. */
  async setNote(orderId: string, note: string): Promise<RegularDto> {
    const order = await this.stallOrder(orderId);
    const key = { storeId: order.storeId, customerId: order.customerId };
    const text = note.trim();
    if (text.length === 0) {
      await this.prisma.storeCustomerNote.deleteMany({ where: key });
    } else {
      await this.prisma.storeCustomerNote.upsert({
        where: { storeId_customerId: key },
        create: { ...key, tenantId: this.tenantId(), note: text },
        update: { note: text },
      });
    }
    return this.forOrder(orderId);
  }

  /** The caller's own standing at a stall: how many orders, since when, the latest one. */
  async mine(storeId: string): Promise<MyStallDto> {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    const delivered = {
      tenantId: this.tenantId(),
      storeId,
      customerId: user.customerId,
      status: ORDER_STATUS.DELIVERED,
    };
    const [count, first, last] = await Promise.all([
      this.prisma.order.count({ where: delivered }),
      this.prisma.order.findFirst({
        where: delivered,
        orderBy: { placedAt: 'asc' },
        select: { placedAt: true },
      }),
      this.prisma.order.findFirst({
        where: delivered,
        orderBy: { placedAt: 'desc' },
        select: { id: true },
      }),
    ]);
    return {
      orders: count,
      since: first === null ? null : first.placedAt.toISOString(),
      lastOrderId: last?.id ?? null,
    };
  }

  /**
   * An order the caller holds as its stall (or as the desk). Anyone else — the customer of it
   * included — gets the NotFound a stranger gets: the memory is the stall's.
   */
  private async stallOrder(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: this.tenantId() },
      select: { id: true, storeId: true, customerId: true, store: { select: { vendorId: true } } },
    });
    if (order === null) throw new NotFoundError('Order', orderId);
    const standing = standingOn(this.currentUser(), order);
    if (!standing.store && !standing.staff) throw new NotFoundError('Order', orderId);
    return order;
  }
}
