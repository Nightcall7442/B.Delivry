/**
 * Cart subscriptions persistence (Prisma). Tenant-scoped.
 */
import type { CartSubscription, PaymentMethod, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';

export interface SubscriptionItem {
  productId: string;
  name: Record<string, string>;
  unit: string;
  quantity: number;
}

export interface CreateSubscriptionData {
  customerId: string;
  storeId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  items: SubscriptionItem[];
  weekday: number;
  hour: number;
  nextRunAt: Date;
}

export class SubscriptionsRepository extends BaseRepository {
  listForCustomer(customerId: string): Promise<CartSubscription[]> {
    return this.prisma.cartSubscription.findMany({
      where: this.scoped({ customerId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string, customerId?: string): Promise<CartSubscription | null> {
    return this.prisma.cartSubscription.findFirst({
      where: this.scoped({ id, ...(customerId !== undefined ? { customerId } : {}) }),
    });
  }

  create(data: CreateSubscriptionData): Promise<CartSubscription> {
    return this.prisma.cartSubscription.create({
      data: {
        ...this.tenantScope(),
        ...data,
        items: data.items as unknown as Prisma.InputJsonValue,
      },
    });
  }

  update(
    id: string,
    data: Partial<Pick<CartSubscription, 'active' | 'weekday' | 'hour' | 'nextRunAt'>>,
  ): Promise<CartSubscription> {
    return this.prisma.cartSubscription.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cartSubscription.delete({ where: { id } });
  }

  /** Active subscriptions whose window opens within `leadMs` and have not run for it yet. */
  due(now: Date, leadMs: number): Promise<CartSubscription[]> {
    const horizon = new Date(now.getTime() + leadMs);
    return this.prisma.cartSubscription.findMany({
      where: this.scoped({ active: true, nextRunAt: { lte: horizon } }),
      orderBy: { nextRunAt: 'asc' },
      take: 100,
    });
  }

  markRun(
    id: string,
    result: { nextRunAt: Date; lastOrderId: string | null; lastError: string | null },
  ): Promise<CartSubscription> {
    return this.prisma.cartSubscription.update({
      where: { id },
      data: { ...result, lastRunAt: new Date() },
    });
  }
}
