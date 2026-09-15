/**
 * "Every Saturday by 8:00": a basket the platform places on the customer's
 * behalf, two hours before the slot. Anything the stall no longer sells is
 * dropped from that week's order; an empty basket or a closed stall is
 * recorded on the row and told to the customer, never retried into a loop.
 */
import { PAYMENT_METHOD, SUBSCRIPTION_LEAD_MINUTES } from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { nextLocalOccurrence } from '@bazar/utils/date';
import type { CartSubscription } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { AddressesService } from '../../addresses/service/addresses.service.js';
import type { CatalogService } from '../../catalog/service/catalog.service.js';
import type { NotificationSender } from '../../notifications/types/index.js';
import type { OrdersService } from '../../orders/service/orders.service.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type {
  SubscriptionItem,
  SubscriptionsRepository,
} from '../repository/subscriptions.repository.js';

export interface SubscriptionsServiceDeps extends ServiceDeps {
  repository: SubscriptionsRepository;
  orders: OrdersService;
  catalog: CatalogService;
  stores: StoresService;
  addresses: AddressesService;
  notifications: NotificationSender;
}

/** A row plus the two names the list screen shows. */
export type SubscriptionWithNames = CartSubscription & {
  storeName: Record<string, string>;
  addressText: string;
};

const LEAD_MS = SUBSCRIPTION_LEAD_MINUTES * 60_000;

export class SubscriptionsService extends BaseService {
  private readonly repository: SubscriptionsRepository;
  private readonly orders: OrdersService;
  private readonly catalog: CatalogService;
  private readonly stores: StoresService;
  private readonly addresses: AddressesService;
  private readonly notifications: NotificationSender;

  constructor(deps: SubscriptionsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.orders = deps.orders;
    this.catalog = deps.catalog;
    this.stores = deps.stores;
    this.addresses = deps.addresses;
    this.notifications = deps.notifications;
  }

  /** Copies the basket, address and payment method of one of the caller's orders. */
  async create(input: {
    orderId: string;
    weekday: number;
    hour: number;
  }): Promise<SubscriptionWithNames> {
    const customerId = this.callerCustomerId();
    const order = await this.orders.get(input.orderId);
    if (order.customerId !== customerId) throw new ForbiddenError('Not your order');
    // Orders placed before addresses were remembered fall back to the default one.
    const addressId =
      order.addressId ??
      (await this.addresses.list()).find((a) => a.isDefault)?.id ??
      (await this.addresses.list())[0]?.id;
    if (addressId === undefined) throw new ConflictError('No saved address to deliver to');
    // Balance and online both need the customer at the phone; cash and card at the door do not.
    const paymentMethod =
      order.paymentMethod === PAYMENT_METHOD.BALANCE ? PAYMENT_METHOD.CASH : order.paymentMethod;

    // Lines whose product was deleted since cannot be reordered; the rest carry their names.
    const items: SubscriptionItem[] = order.items.flatMap((item) =>
      item.productId === null
        ? []
        : [
            {
              productId: item.productId,
              name: item.name as Record<string, string>,
              unit: item.unit,
              quantity: Number(item.quantity),
            },
          ],
    );
    if (items.length === 0) throw new ConflictError('Nothing in this order can be reordered');

    const row = await this.repository.create({
      customerId,
      storeId: order.storeId,
      addressId,
      paymentMethod,
      items,
      weekday: input.weekday,
      hour: input.hour,
      nextRunAt: nextLocalOccurrence(input.weekday, input.hour),
    });
    return this.withNames(row);
  }

  async list(): Promise<SubscriptionWithNames[]> {
    const rows = await this.repository.listForCustomer(this.callerCustomerId());
    return Promise.all(rows.map((row) => this.withNames(row)));
  }

  async update(
    id: string,
    patch: {
      active?: boolean | undefined;
      weekday?: number | undefined;
      hour?: number | undefined;
    },
  ): Promise<SubscriptionWithNames> {
    const row = await this.owned(id);
    const weekday = patch.weekday ?? row.weekday;
    const hour = patch.hour ?? row.hour;
    const rescheduled = weekday !== row.weekday || hour !== row.hour;
    const updated = await this.repository.update(id, {
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      weekday,
      hour,
      ...(rescheduled ? { nextRunAt: nextLocalOccurrence(weekday, hour) } : {}),
    });
    return this.withNames(updated);
  }

  async remove(id: string): Promise<void> {
    await this.owned(id);
    await this.repository.remove(id);
  }

  /**
   * The job body: place every order whose window opens within the lead time.
   * Runs as the system inside one tenant; each subscription is its own try.
   */
  async runDue(now: Date = new Date()): Promise<number> {
    const due = await this.repository.due(now, LEAD_MS);
    let placed = 0;
    for (const subscription of due) {
      const nextRunAt = nextLocalOccurrence(
        subscription.weekday,
        subscription.hour,
        subscription.nextRunAt,
      );
      try {
        const order = await this.place(subscription);
        await this.repository.markRun(subscription.id, {
          nextRunAt,
          lastOrderId: order?.id ?? null,
          lastError: order === null ? 'Nothing from the basket is on sale today' : null,
        });
        if (order !== null) placed += 1;
        else {
          await this.tell(
            subscription,
            'Ничего из корзины сегодня нет в продаже — заказ пропущен.',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        await this.repository.markRun(subscription.id, {
          nextRunAt,
          lastOrderId: null,
          lastError: message,
        });
        await this.tell(subscription, `Не удалось оформить заказ по подписке: ${message}`);
      }
    }
    return placed;
  }

  /** Null when nothing from the snapshot is purchasable right now. */
  private async place(subscription: CartSubscription) {
    const snapshot = subscription.items as unknown as SubscriptionItem[];
    const purchasable = await this.catalog.getPurchasable(
      subscription.storeId,
      snapshot.map((item) => item.productId),
    );
    const items = snapshot
      .filter((item) => purchasable.has(item.productId))
      .map((item) => ({ productId: item.productId, quantity: item.quantity }));
    if (items.length === 0) return null;

    return this.orders.create(
      {
        storeId: subscription.storeId,
        addressId: subscription.addressId,
        paymentMethod: subscription.paymentMethod,
        items,
        scheduledFor: subscription.nextRunAt,
        comment: 'Заказ по подписке',
      },
      subscription.customerId,
    );
  }

  private async tell(subscription: CartSubscription, body: string): Promise<void> {
    await this.notifications.send({
      tenantId: subscription.tenantId,
      userId: subscription.customerId,
      template: TEMPLATE.PROMO,
      params: { title: 'Подписка на корзину', body },
      deepLink: '/subscriptions',
      idempotencyKey: `subscription:${subscription.id}:${subscription.nextRunAt.toISOString()}`,
    });
  }

  private async withNames(row: CartSubscription): Promise<SubscriptionWithNames> {
    const [store, address] = await Promise.all([
      this.stores.get(row.storeId),
      this.addresses.getFrozen(row.addressId, row.customerId).catch(() => null),
    ]);
    return {
      ...row,
      storeName: store.name as Record<string, string>,
      addressText: address?.formatted ?? '',
    };
  }

  private async owned(id: string): Promise<CartSubscription> {
    const row = await this.repository.findById(id, this.callerCustomerId());
    if (row === null) throw new NotFoundError('Subscription', id);
    return row;
  }

  private callerCustomerId(): string {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    return user.customerId;
  }
}
