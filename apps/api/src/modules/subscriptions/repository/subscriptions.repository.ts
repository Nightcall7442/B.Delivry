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

/** How long a claimed subscription stays claimed while its order is being placed. */
const CLAIM_LEASE_MS = 10 * 60_000;

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

  countForCustomer(customerId: string): Promise<number> {
    return this.prisma.cartSubscription.count({ where: this.scoped({ customerId }) });
  }

  update(
    id: string,
    data: Partial<Pick<CartSubscription, 'active' | 'weekday' | 'hour' | 'nextRunAt'>>,
  ): Promise<CartSubscription> {
    return this.prisma.cartSubscription.update({ where: { id, ...this.tenantScope() }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.cartSubscription.delete({ where: { id, ...this.tenantScope() } });
  }

  /**
   * Active subscriptions whose window opens within `leadMs` and have not run for it yet, handed to
   * this caller alone: each row is claimed (its `lastRunAt` taken) before it is returned, so a
   * second scheduler tick or instance reading the same table does not place the same order again.
   * A claim that is never completed (a crash) lapses after CLAIM_LEASE_MS and the row is offered
   * again.
   */
  async due(now: Date, leadMs: number): Promise<CartSubscription[]> {
    const horizon = new Date(now.getTime() + leadMs);
    const lapsed = new Date(now.getTime() - CLAIM_LEASE_MS);
    const unclaimed = [{ lastRunAt: null }, { lastRunAt: { lt: lapsed } }];

    const candidates = await this.prisma.cartSubscription.findMany({
      where: this.scoped({ active: true, nextRunAt: { lte: horizon }, OR: unclaimed }),
      orderBy: { nextRunAt: 'asc' },
      take: 100,
    });

    const mine: CartSubscription[] = [];
    for (const row of candidates) {
      const won = await this.prisma.cartSubscription.updateMany({
        where: this.scoped({ id: row.id, nextRunAt: row.nextRunAt, OR: unclaimed }),
        data: { lastRunAt: now },
      });
      if (won.count === 1) mine.push(row);
    }
    return mine;
  }

  markRun(
    id: string,
    result: { nextRunAt: Date; lastOrderId: string | null; lastError: string | null },
  ): Promise<CartSubscription> {
    return this.prisma.cartSubscription.update({
      where: { id, ...this.tenantScope() },
      data: { ...result, lastRunAt: new Date() },
    });
  }
}
