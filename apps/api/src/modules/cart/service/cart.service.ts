/**
 * Cart business logic. One cart per store, live price reconciliation.
 */
import { LIMITS, type Currency } from '@bazar/constants';
import { money, multiply, sumMoney, zero } from '@bazar/payments';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PrismaTransaction } from '../../../common/base/base.repository.js';
import type { CatalogService } from '../../catalog/service/catalog.service.js';
import type { CartRepository, CartWithItems } from '../repository/cart.repository.js';
import type { AddItemInput, CartLine, CartView } from '../types/index.js';

export interface CartServiceDeps extends ServiceDeps {
  repository: CartRepository;
  catalog: CatalogService;
}

export class CartService extends BaseService {
  private readonly repository: CartRepository;
  private readonly catalog: CatalogService;

  constructor(deps: CartServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.catalog = deps.catalog;
  }

  private customerId(): string {
    const id = this.currentUser().customerId;
    if (id === undefined) throw new ForbiddenError('Customer profile required');
    return id;
  }

  /**
   * Every read reconciles against the live catalog: a bazaar price can change
   * between adding tomatoes and checking out, and the customer must see that
   * before they order rather than discover it on the receipt.
   */
  async get(storeId: string): Promise<CartView> {
    const cart = await this.repository.ensure(this.customerId(), storeId);
    return this.toView(cart);
  }

  async list(): Promise<CartView[]> {
    const carts = await this.repository.listForCustomer(this.customerId());
    return Promise.all(carts.map((cart) => this.toView(cart)));
  }

  private async toView(cart: CartWithItems): Promise<CartView> {
    const products = await this.catalog.getPurchasable(
      cart.storeId,
      cart.items.map((item) => item.productId),
    );

    const lines: CartLine[] = cart.items.map((item) => {
      const product = products.get(item.productId);
      const currency = item.currency as Currency;
      const unitPrice = money(item.unitPrice, currency);
      const quantity = Number(item.quantity);

      // A product missing from the purchasable set is gone or switched off.
      const currentPrice = product === undefined ? unitPrice : money(product.price, currency);

      return {
        id: item.id,
        productId: item.productId,
        name: product?.name ?? {},
        unit: product?.unit ?? 'PCS',
        quantity,
        unitPrice,
        currentPrice,
        total: multiply(currentPrice, quantity),
        comment: item.comment,
        available: product !== undefined,
        priceChanged: product !== undefined && product.price !== item.unitPrice,
      };
    });

    const currency = (cart.items[0]?.currency ?? 'UZS') as Currency;
    const available = lines.filter((line) => line.available);

    return {
      id: cart.id,
      storeId: cart.storeId,
      items: lines,
      subtotal: sumMoney(
        available.map((line) => line.total),
        currency,
      ),
      itemCount: lines.length,
      hasPriceChanges: lines.some((line) => line.priceChanged),
      hasUnavailable: lines.some((line) => !line.available),
      expiresAt: cart.expiresAt,
    };
  }

  async addItem(input: AddItemInput): Promise<CartView> {
    const customerId = this.customerId();
    const products = await this.catalog.getPurchasable(input.storeId, [input.productId]);
    const product = products.get(input.productId);
    if (product === undefined) throw new NotFoundError('Product', input.productId);

    if (input.quantity < product.minQuantity) {
      throw new ConflictError(`Minimum quantity is ${product.minQuantity}`);
    }

    const cart = await this.repository.ensure(customerId, input.storeId);

    if (await this.isFull(cart.id, input.productId)) {
      throw new ConflictError(`A cart may hold at most ${LIMITS.CART_MAX_ITEMS} items`);
    }

    await this.repository.upsertItem(
      cart.id,
      input.productId,
      input.quantity,
      product.price,
      product.currency,
      input.comment ?? null,
    );

    return this.get(input.storeId);
  }

  private async isFull(cartId: string, productId: string): Promise<boolean> {
    // An existing line only grows, so it does not count against the limit.
    const existing = await this.repository.findItemByProduct(cartId, productId);
    if (existing !== null) return false;
    return (await this.repository.countItems(cartId)) >= LIMITS.CART_MAX_ITEMS;
  }

  async updateItem(
    storeId: string,
    itemId: string,
    quantity: number,
    comment?: string,
  ): Promise<CartView> {
    const cart = await this.repository.ensure(this.customerId(), storeId);
    const item = await this.repository.findItem(cart.id, itemId);
    if (item === null) throw new NotFoundError('Cart item', itemId);

    if (quantity <= 0) {
      await this.repository.removeItem(itemId);
    } else {
      await this.repository.setItemQuantity(itemId, quantity, comment ?? item.comment);
    }

    return this.get(storeId);
  }

  async removeItem(storeId: string, itemId: string): Promise<CartView> {
    const cart = await this.repository.ensure(this.customerId(), storeId);
    const item = await this.repository.findItem(cart.id, itemId);
    if (item === null) throw new NotFoundError('Cart item', itemId);
    await this.repository.removeItem(itemId);
    return this.get(storeId);
  }

  /**
   * Items in the shape the order flow wants. Unavailable lines are dropped
   * here rather than failing the whole checkout on one sold-out product.
   */
  async itemsFor(
    customerId: string,
    storeId: string,
  ): Promise<{ productId: string; quantity: number; comment?: string }[]> {
    const cart = await this.repository.find(customerId, storeId);
    if (cart === null) return [];

    const products = await this.catalog.getPurchasable(
      storeId,
      cart.items.map((item) => item.productId),
    );

    return cart.items
      .filter((item) => products.has(item.productId))
      .map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        ...(item.comment !== null ? { comment: item.comment } : {}),
      }));
  }

  /** Called inside the order transaction, so a failed order keeps the cart. */
  async clear(customerId: string, storeId: string, tx?: PrismaTransaction): Promise<void> {
    await this.repository.clear(customerId, storeId, tx);
  }

  async clearOwn(storeId: string): Promise<void> {
    await this.repository.clear(this.customerId(), storeId);
  }

  zeroFor(currency: Currency) {
    return zero(currency);
  }
}
