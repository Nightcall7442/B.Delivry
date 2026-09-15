/**
 * Cart persistence (Prisma). Tenant-scoped.
 */
import { LIMITS } from '@bazar/constants';
import type { Cart, CartItem, Prisma } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';

const CART_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CartInclude;

export type CartWithItems = Cart & { items: CartItem[] };

export class CartRepository extends BaseRepository {
  private expiry(): Date {
    return new Date(Date.now() + LIMITS.CART_TTL_HOURS * 3600 * 1000);
  }

  async find(customerId: string, storeId: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findUnique({
      where: { customerId_storeId: { customerId, storeId } },
      include: CART_INCLUDE,
    });
  }

  /** One cart per (customer, store); the unique key makes this race-safe. */
  async ensure(customerId: string, storeId: string): Promise<CartWithItems> {
    return this.prisma.cart.upsert({
      where: { customerId_storeId: { customerId, storeId } },
      create: {
        tenantId: this.tenantScope().tenantId,
        customerId,
        storeId,
        expiresAt: this.expiry(),
      },
      update: { expiresAt: this.expiry() },
      include: CART_INCLUDE,
    });
  }

  async listForCustomer(customerId: string): Promise<CartWithItems[]> {
    return this.prisma.cart.findMany({
      where: this.scoped({ customerId, expiresAt: { gt: new Date() } }),
      include: CART_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Adding the same product twice adds quantity rather than creating a second
   * line, which is what a customer expects when they tap + on a product page.
   */
  async upsertItem(
    cartId: string,
    productId: string,
    quantity: number,
    unitPrice: number,
    currency: string,
    comment: string | null,
  ): Promise<CartItem> {
    return this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity, unitPrice, currency, comment },
      update: { quantity: { increment: quantity }, comment },
    });
  }

  async setItemQuantity(
    itemId: string,
    quantity: number,
    comment: string | null,
  ): Promise<CartItem> {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, comment },
    });
  }

  async findItem(cartId: string, itemId: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
  }

  async findItemByProduct(cartId: string, productId: string): Promise<CartItem | null> {
    return this.prisma.cartItem.findUnique({ where: { cartId_productId: { cartId, productId } } });
  }

  async removeItem(itemId: string): Promise<void> {
    await this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  async countItems(cartId: string): Promise<number> {
    return this.prisma.cartItem.count({ where: { cartId } });
  }

  async clear(customerId: string, storeId: string, tx?: PrismaTransaction): Promise<void> {
    const client = this.client(tx);
    const cart = await client.cart.findUnique({
      where: { customerId_storeId: { customerId, storeId } },
      select: { id: true },
    });
    if (cart === null) return;
    await client.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  /** Housekeeping: expired carts are dead weight nobody will return to. */
  async deleteExpired(before: Date): Promise<number> {
    const result = await this.prisma.cart.deleteMany({ where: { expiresAt: { lt: before } } });
    return result.count;
  }
}
