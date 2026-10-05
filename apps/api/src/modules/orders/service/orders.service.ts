/**
 * Orders business logic. Order lifecycle: creation, state machine, status history, cancellation, repeat order.
 */
import { randomUUID } from 'node:crypto';
import { haversineMeters } from '@bazar/maps';
import {
  type Currency,
  DEFAULT_CURRENCY,
  GUARANTEE,
  LIMITS,
  ORDER_STATUS,
  type OrderStatus,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  PERMISSION,
  type PaymentMethod,
  type PaymentStatus,
  SAME_BAZAAR_METERS,
  SUBSTITUTION_POLICY,
  VEHICLE_AVG_SPEED_KMH,
  STORE_TYPE,
  WEIGHTED_UNITS,
} from '@bazar/constants';
import { add, money, multiply, sumMoney, zero, type Money } from '@bazar/payments';
import { unitPriceFor } from '@bazar/storefront';
import type { OrderQuoteDto, QuoteOrderDto } from '@bazar/types';
import { orderNumber } from '@bazar/utils';
import type { ChatMessage, PrismaClient } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/index.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { runInTransaction } from '../../../database/transaction.js';
import { createEvent } from '../../../events/event-bus.js';
import { ordersCreated, orderStatusChanges } from '../../../infrastructure/telemetry/metrics.js';
import type { AddressesService } from '../../addresses/service/addresses.service.js';
import type { CartService } from '../../cart/service/cart.service.js';
import type { CatalogService } from '../../catalog/service/catalog.service.js';
import type { PricingService } from '../../pricing/service/pricing.service.js';
import type { PromotionsService } from '../../promotions/service/promotions.service.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type { OpenStore } from '../../stores/types/index.js';
import type { HaggleService } from '../../haggle/service/haggle.service.js';
import {
  assertActorTransition,
  COURIER_ACTION_STATUS,
  isTerminal,
  type Actor,
  type CourierAction,
} from '../domain/order-state-machine.js';
import { ORDER_EVENT } from '../domain/order.events.js';
import { standingOn } from '../domain/order-party.js';
import { boughtSoFar, isBuyableQuantity, WEIGHING_STATUSES } from '../domain/order-weighing.js';
import type { OrdersRepository, OrderWithRelations } from '../repository/orders.repository.js';
import type {
  ActualQuantity,
  CreateOrderInput,
  OrderItemInput,
  OrderListFilters,
  OrderTotals,
  PricedItem,
} from '../types/index.js';

export interface OrdersServiceDeps extends ServiceDeps {
  prisma: PrismaClient;
  repository: OrdersRepository;
  cart: CartService;
  catalog: CatalogService;
  stores: StoresService;
  addresses: AddressesService;
  pricing: PricingService;
  promotions: PromotionsService;
  /** Tenant switch: skip the operator review step. */
  autoConfirm: (tenantId: string) => Promise<boolean>;
  haggle: HaggleService;
}

export class OrdersService extends BaseService {
  private readonly prisma: PrismaClient;
  private readonly repository: OrdersRepository;
  private readonly cart: CartService;
  private readonly catalog: CatalogService;
  private readonly stores: StoresService;
  private readonly haggle: HaggleService;
  private readonly addresses: AddressesService;
  private readonly pricing: PricingService;
  private readonly promotions: PromotionsService;
  private readonly autoConfirm: (tenantId: string) => Promise<boolean>;

  constructor(deps: OrdersServiceDeps) {
    super(deps);
    this.prisma = deps.prisma;
    this.repository = deps.repository;
    this.cart = deps.cart;
    this.catalog = deps.catalog;
    this.stores = deps.stores;
    this.haggle = deps.haggle;
    this.addresses = deps.addresses;
    this.pricing = deps.pricing;
    this.promotions = deps.promotions;
    this.autoConfirm = deps.autoConfirm;
  }

  /**
   * Creation is the only place prices are decided. Everything is captured now:
   * item prices, the delivery fee, the discount and the address text. Later
   * edits to the catalog, the tariff or the saved address cannot change what
   * this customer agreed to pay.
   */
  async create(input: CreateOrderInput, asCustomerId?: string): Promise<OrderWithRelations> {
    const customerId = this.orderingCustomerId(asCustomerId);
    const byJob = asCustomerId !== undefined && this.context().system === true;
    await this.assertMayOrder(customerId);

    // A window that has already started cannot be promised: a checkout left open overnight has to
    // choose again. The subscription job keeps its own schedule.
    if (!byJob && input.scheduledFor !== undefined && input.scheduledFor.getTime() <= Date.now()) {
      throw new ConflictError(WINDOW_STARTED);
    }
    const store = await this.stores.getOpenStore(input.storeId, input.scheduledFor);
    const address = await this.addresses.getFrozen(input.addressId, customerId);

    const items = await this.priceItems(input, customerId);
    if (items.length === 0) {
      throw new AppError(ERROR_CODE.CART_EMPTY, 422, 'Nothing to order');
    }
    if (items.length > LIMITS.ORDER_MAX_ITEMS) {
      throw new ConflictError(`An order may hold at most ${LIMITS.ORDER_MAX_ITEMS} items`);
    }

    const currency = items[0]!.total.currency;
    const subtotal = sumMoney(
      items.map((item) => item.total),
      currency,
    );

    const coupon =
      input.couponCode === undefined
        ? null
        : await this.promotions.evaluate(input.couponCode, input.storeId, subtotal, customerId);
    const plus = await this.isPlus(customerId);
    const dueAt = await this.invoiceDueAt(input.paymentMethod, customerId);

    if (address.lat === null || address.lng === null) {
      throw new AppError(
        ERROR_CODE.UNDELIVERABLE_ADDRESS,
        422,
        'Address has no map location; pick a point on the map',
      );
    }

    // Priced exactly as the quote the customer was shown: the stall's own minimum and free-delivery
    // threshold, and the goods' weight for the car surcharge, as `quote` passes them.
    const quote = await this.pricing.quote({
      from: { lat: store.lat, lng: store.lng },
      to: { lat: address.lat, lng: address.lng },
      subtotal,
      cityId: address.cityId,
      ...(input.scheduledFor !== undefined ? { at: input.scheduledFor } : {}),
      weightGrams: items.reduce(
        (sum, item) => sum + (item.weightGrams ?? 0) * Number(item.quantity),
        0,
      ),
      ...(store.minOrder !== null ? { minOrder: money(store.minOrder, currency) } : {}),
      ...(store.freeDeliveryThreshold !== null
        ? { freeDeliveryThreshold: money(store.freeDeliveryThreshold, currency) }
        : {}),
      ...(coupon !== null ? { discount: coupon.discount } : {}),
      ...(plus || coupon?.freeDelivery === true || input.groupFollower === true
        ? { freeDelivery: true }
        : {}),
      ...(input.groupSubtotal !== undefined
        ? { thresholdSubtotal: money(input.groupSubtotal, currency) }
        : {}),
    });

    if (!quote.deliverable) {
      throw new AppError(
        ERROR_CODE.ORDER_BELOW_MINIMUM,
        422,
        quote.reason ?? 'Order cannot be delivered',
      );
    }

    const totals: OrderTotals = {
      subtotal: quote.subtotal,
      deliveryFee: quote.deliveryFee,
      serviceFee: quote.serviceFee,
      discount: quote.discount,
      total: quote.total,
    };
    if (dueAt !== null) await this.assertCredit(customerId, totals.total.amount);

    const order = await runInTransaction(this.prisma, async (tx) => {
      const created = await this.repository.create(
        {
          tenantId: this.tenantId(),
          number: orderNumber(),
          customerId,
          storeId: input.storeId,
          items,
          totals,
          address,
          paymentMethod: input.paymentMethod,
          comment: input.comment ?? null,
          vendorComment: input.vendorComment ?? null,
          substitutionPolicy: input.substitutionPolicy ?? SUBSTITUTION_POLICY.CALL,
          scheduledFor: input.scheduledFor ?? null,
          // A slot is promised by the end of its window; ASAP by the ETA shown at checkout.
          promisedAt:
            input.scheduledFor !== undefined
              ? new Date(input.scheduledFor.getTime() + GUARANTEE.SLOT_WINDOW_MINUTES * 60_000)
              : new Date(Date.now() + this.etaMinutesFor(store, quote.distanceMeters) * 60_000),
          couponId: coupon?.couponId ?? null,
          addressId: input.addressId,
          // A group's followers ride on the leader's trip: no second payout.
          courierFee: input.groupFollower === true ? 0 : quote.courierFee.amount,
          // The vendor's own rate when the desk set one, else the zone tariff's.
          commissionPercent: store.commissionPercent ?? quote.commissionPercent,
          currency,
          recipientName: input.recipientName ?? null,
          recipientPhone: input.recipientPhone ?? null,
          groupId: input.groupId ?? null,
          dueAt,
        },
        tx,
      );

      if (coupon !== null) {
        await this.promotions.redeem(coupon.couponId, customerId, created.id, coupon.discount, tx);
      }

      // The cart has become an order; leaving it would let the customer
      // check out the same goods twice.
      if (input.items === undefined) {
        await this.cart.clear(customerId, input.storeId, tx);
      }

      return created;
    });

    ordersCreated.labels(address.cityId, input.paymentMethod).inc();

    // Published after commit: handlers send notifications, and there is no
    // recalling an SMS if the transaction had rolled back.
    await this.publish(
      createEvent(ORDER_EVENT.CREATED, {
        orderId: order.id,
        number: order.number,
        customerId,
        storeId: input.storeId,
        cityId: address.cityId,
        total: totals.total.amount,
        currency,
        paymentMethod: input.paymentMethod,
        itemCount: items.length,
      }),
    );

    // Cash orders need no payment step, so a tenant that trusts its stores can
    // send them straight to the courier search.
    if (input.paymentMethod === PAYMENT_METHOD.CASH && (await this.autoConfirm(this.tenantId()))) {
      return this.confirm(order.id, true);
    }

    return order;
  }

  /**
   * Cross-bazaar: several stalls of one bazaar in one courier trip. One order
   * per stall (each vendor confirms and gets paid for its own), one delivery
   * fee on the first, and a shared group id the dispatch follows.
   */
  async createGroup(input: CreateGroupInput): Promise<OrderWithRelations[]> {
    await this.assertSameBazaar(
      input.stores.map((entry) => entry.storeId),
      input.scheduledFor,
    );
    const groupId = randomUUID();
    const { stores, ...common } = input;
    const groupSubtotal = await this.groupSubtotal(input.addressId, stores);
    const created: OrderWithRelations[] = [];
    for (const [index, entry] of stores.entries()) {
      created.push(
        await this.create({
          ...common,
          storeId: entry.storeId,
          items: entry.items,
          groupId,
          groupFollower: index > 0,
          ...(index === 0 ? { groupSubtotal } : {}),
        }),
      );
    }
    return created;
  }

  async quoteGroup(input: QuoteGroupInput): Promise<OrderQuote[]> {
    await this.assertSameBazaar(
      input.stores.map((entry) => entry.storeId),
      input.scheduledFor === undefined ? undefined : new Date(input.scheduledFor),
    );
    const { stores, ...common } = input;
    const groupSubtotal = await this.groupSubtotal(input.addressId, stores, input.point);
    const quotes: OrderQuote[] = [];
    for (const [index, entry] of stores.entries()) {
      quotes.push(
        await this.quote({
          ...common,
          storeId: entry.storeId,
          items: entry.items,
          groupFollower: index > 0,
          ...(index === 0 ? { groupSubtotal } : {}),
        }),
      );
    }
    return quotes;
  }

  /** Goods of the whole trip: what the free-delivery threshold is measured against. */
  private async groupSubtotal(
    addressId: string | undefined,
    stores: GroupEntry[],
    point?: { lat: number; lng: number },
  ): Promise<number> {
    let total = 0;
    for (const entry of stores) {
      const quote = await this.quote({
        ...(addressId !== undefined ? { addressId } : {}),
        ...(point !== undefined ? { point } : {}),
        storeId: entry.storeId,
        items: entry.items,
        groupFollower: true,
      });
      total += quote.totals.subtotal.amount;
    }
    return total;
  }

  /** Sibling orders of a trip, the leader first. */
  group(groupId: string): Promise<OrderWithRelations[]> {
    return this.repository.findGroup(groupId);
  }

  /** Stalls farther apart than a bazaar's rows are two trips, not one. */
  private async assertSameBazaar(storeIds: string[], at?: Date): Promise<void> {
    if (new Set(storeIds).size < 2) throw new ConflictError('A group needs two different stalls');
    // Followers ride free on the leader's trip: a stall listed twice would split its goods into a free second order.
    if (new Set(storeIds).size !== storeIds.length) {
      throw new ConflictError('Each stall may appear in a group once');
    }
    const stores = await Promise.all(storeIds.map((id) => this.stores.getOpenStore(id, at)));
    // One courier walks one bazaar; a supermarket is a separate trip however close it is.
    if (stores.some((store) => !STALL_TYPES.includes(store.type))) {
      throw new ConflictError('Only bazaar stalls can share one delivery');
    }
    const [first, ...rest] = stores as [OpenStore, ...OpenStore[]];
    for (const store of rest) {
      if (haversineMeters(first, store) > SAME_BAZAAR_METERS) {
        throw new ConflictError('These stalls are not in one bazaar');
      }
    }
  }

  /**
   * What checkout shows before anything is committed: the same pricing path as
   * `create`, minus the store-open check (a quote at 05:50 for a 06:00 slot is
   * fine) and minus the writes. Undeliverable comes back as a reason, not an
   * error, because the screen has to explain it, not crash on it.
   */
  async quote(input: QuoteOrderInput): Promise<OrderQuote> {
    const user = this.currentUser();
    const customerId = user.customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');
    await this.assertMayOrder(customerId);

    const store = await this.stores.get(input.storeId);
    if (store.lat === null || store.lng === null) {
      return unquotable('Store has no map location', zero(DEFAULT_CURRENCY));
    }

    let to: { lat: number; lng: number } | null = input.point ?? null;
    let cityId: string | undefined = store.cityId;
    if (input.addressId !== undefined) {
      const address = await this.addresses.getFrozen(input.addressId, customerId);
      to =
        address.lat === null || address.lng === null
          ? null
          : { lat: address.lat, lng: address.lng };
      cityId = address.cityId;
    }
    if (to === null) return unquotable('Address has no map location', zero(DEFAULT_CURRENCY));

    const items = await this.priceItems({ storeId: input.storeId, items: input.items }, customerId);
    if (items.length === 0) return unquotable('Nothing to order', zero(DEFAULT_CURRENCY));

    const currency = items[0]!.total.currency;
    const subtotal = sumMoney(
      items.map((item) => item.total),
      currency,
    );
    const coupon =
      input.couponCode === undefined
        ? null
        : await this.promotions.evaluate(input.couponCode, input.storeId, subtotal, customerId);

    const plus = await this.isPlus(customerId);
    // The slot the customer picked, or this minute for «as soon as possible».
    const openAt = input.scheduledFor === undefined ? new Date() : new Date(input.scheduledFor);
    const quote = await this.pricing.quote({
      from: { lat: Number(store.lat), lng: Number(store.lng) },
      to,
      subtotal,
      cityId,
      // Surge at the window, as create charges it.
      ...(input.scheduledFor !== undefined ? { at: openAt } : {}),
      weightGrams: items.reduce(
        (sum, item) => sum + (item.weightGrams ?? 0) * Number(item.quantity),
        0,
      ),
      ...(store.minOrder !== null ? { minOrder: money(store.minOrder, currency) } : {}),
      ...(store.freeDeliveryThreshold !== null
        ? { freeDeliveryThreshold: money(store.freeDeliveryThreshold, currency) }
        : {}),
      ...(coupon !== null ? { discount: coupon.discount } : {}),
      ...(plus || coupon?.freeDelivery === true || input.groupFollower === true
        ? { freeDelivery: true }
        : {}),
      ...(input.groupSubtotal !== undefined
        ? { thresholdSubtotal: money(input.groupSubtotal, currency) }
        : {}),
    });

    const started = input.scheduledFor !== undefined && openAt.getTime() <= Date.now();
    const open = this.stores.isOpen(store, openAt);
    return {
      deliverable: quote.deliverable && !started && open,
      reason: !quote.deliverable
        ? quote.reason
        : started
          ? WINDOW_STARTED
          : open
            ? null
            : 'Store is closed',
      distanceMeters: quote.distanceMeters,
      etaMinutes: this.etaMinutesFor(store, quote.distanceMeters),
      totals: {
        subtotal: quote.subtotal,
        deliveryFee: quote.deliveryFee,
        serviceFee: quote.serviceFee,
        discount: quote.discount,
        total: quote.total,
      },
      minOrder: quote.minOrder,
      freeDeliveryThreshold: quote.freeDeliveryThreshold,
      heavy: quote.heavy,
      heavySurcharge: quote.heavySurcharge,
    };
  }

  private async priceItems(
    input: Pick<CreateOrderInput, 'storeId' | 'items'>,
    customerId: string,
  ): Promise<PricedItem[]> {
    const requested: OrderItemInput[] =
      input.items ?? (await this.cart.itemsFor(customerId, input.storeId));

    const products = await this.catalog.getPurchasable(
      input.storeId,
      requested.map((item) => item.productId),
    );
    // Торг: a price the stall agreed with this customer beats the list price.
    const agreed = await this.haggle.agreedPrices(
      customerId,
      requested.map((item) => item.productId),
    );

    return requested.map((requestedItem) => {
      const product = products.get(requestedItem.productId);
      if (product === undefined) {
        throw new AppError(
          ERROR_CODE.PRODUCT_UNAVAILABLE,
          409,
          `Product ${requestedItem.productId} is unavailable`,
        );
      }

      if (product.stock !== null && requestedItem.quantity > product.stock) {
        throw new AppError(
          ERROR_CODE.INSUFFICIENT_STOCK,
          409,
          `Only ${product.stock} left of ${product.slug}`,
        );
      }

      // A quantity tier prices the whole line («от 10 кг по 16 000»); a price agreed in haggling
      // stands where it is lower still. Weighing later keeps this per-unit price.
      const listOrTier = unitPriceFor(product.price, product.priceTiers, requestedItem.quantity);
      const haggled = agreed.get(product.id);
      const unitPrice = money(
        haggled === undefined ? listOrTier : Math.min(haggled, listOrTier),
        product.currency as Currency,
      );
      return {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: requestedItem.quantity,
        unitPrice,
        total: multiply(unitPrice, requestedItem.quantity),
        comment: requestedItem.comment ?? null,
        weightGrams: product.weightGrams,
      };
    });
  }

  async confirm(orderId: string, automatic = false): Promise<OrderWithRelations> {
    const order = await this.changeStatus(
      orderId,
      ORDER_STATUS.CONFIRMED,
      automatic ? 'system' : await this.actorFor(orderId),
    );

    await this.publish(
      createEvent(ORDER_EVENT.CONFIRMED, {
        orderId: order.id,
        number: order.number,
        customerId: order.customerId,
        storeId: order.storeId,
        cityId: order.addressCityId,
        autoConfirmed: automatic,
        scheduledFor: order.scheduledFor === null ? null : order.scheduledFor.toISOString(),
        priority: await this.isPlus(order.customerId),
      }),
    );

    return order;
  }

  /**
   * Who is asking to move this order, as the state machine knows them: the desk, or the vendor of
   * the stall it was placed with. Anybody else — another stall's vendor included — is refused, so
   * holding `order:update` is never enough on its own.
   */
  private async actorFor(orderId: string): Promise<'staff' | 'store'> {
    const order = await this.getOrThrow(orderId);
    const standing = standingOn(this.currentUser(), order);
    if (standing.staff) return 'staff';
    if (standing.store) return 'store';
    throw new ForbiddenError('Not an order of your stall');
  }

  /** The operator override behind `PATCH /orders/:id/status`: any legal move, the desk only. */
  async changeStatusAsStaff(
    orderId: string,
    to: OrderStatus,
    comment?: string,
  ): Promise<OrderWithRelations> {
    const order = await this.getOrThrow(orderId);
    if (!standingOn(this.currentUser(), order).staff) {
      throw new ForbiddenError('Only the desk may move an order to any status');
    }
    return this.changeStatus(orderId, to, 'staff', comment);
  }

  /**
   * The single door every status change goes through. It checks the move is
   * legal, that this actor may make it, and that nobody changed the order in
   * between; then it writes the row and publishes.
   */
  async changeStatus(
    orderId: string,
    to: OrderStatus,
    actor: Actor,
    comment?: string,
  ): Promise<OrderWithRelations> {
    const order = await this.getOrThrow(orderId);
    const from = order.status;

    // Before the transition table, so the 409 below never tells a stranger what state the order is in.
    if (actor === 'courier') this.assertCarriedByCaller(order);
    assertActorTransition(actor, from, to);

    const actorId = actor === 'system' ? null : (this.context().user?.id ?? null);
    const updated = await this.repository.applyStatus(orderId, from, to, actorId, comment ?? null);

    // Lost the race: another actor moved the order first. Re-read and let the
    // caller see the current state rather than reporting a false success.
    if (updated === null) {
      throw new ConflictError('Order status changed concurrently, retry');
    }

    orderStatusChanges.labels(from, to).inc();

    await this.publish(
      createEvent(ORDER_EVENT.STATUS_CHANGED, {
        orderId: order.id,
        number: order.number,
        customerId: order.customerId,
        storeId: order.storeId,
        cityId: order.addressCityId,
        from,
        to,
        actorId,
        comment: comment ?? null,
      }),
    );

    if (to === ORDER_STATUS.DELIVERED) {
      await this.publish(
        createEvent(ORDER_EVENT.DELIVERED, {
          orderId: order.id,
          number: order.number,
          customerId: order.customerId,
          storeId: order.storeId,
          cityId: order.addressCityId,
          courierId: order.courierId,
          deliverySeconds: Math.round((Date.now() - order.placedAt.getTime()) / 1000),
        }),
      );
    }

    return this.getOrThrow(orderId);
  }

  /**
   * A courier's verb on the order they carry. Finishing or failing the trip is not one of them: it
   * has to go through the delivery, which is where the handover is checked, the payout is booked
   * and the cash the courier collected becomes the courier's debt.
   */
  async courierAction(
    orderId: string,
    action: CourierAction,
    comment?: string,
  ): Promise<OrderWithRelations> {
    if (action === 'delivered' || action === 'failed') {
      throw new ConflictError('Finish or fail the trip from the delivery, not from the order');
    }
    return this.changeStatus(orderId, COURIER_ACTION_STATUS[action], 'courier', comment);
  }

  /**
   * The courier on the token must be the one the order is assigned to. A courier role alone is
   * every courier's, so on its own it would let any of them move or reprice any order.
   */
  private assertCarriedByCaller(order: OrderWithRelations): void {
    if (this.context().system === true) return;
    const courierId = this.currentUser().courierId;
    if (courierId === undefined || order.courierId === null || order.courierId !== courierId) {
      throw new ForbiddenError('This order is assigned to another courier');
    }
  }

  /**
   * Cancellation, from whichever side asked. A customer may only cancel before
   * pickup; after that the goods are bought and paid for at the stall, so it
   * goes through support and becomes a refund decision.
   */
  async cancel(orderId: string, reason: string): Promise<OrderWithRelations> {
    const order = await this.getOrThrow(orderId);
    const standing = standingOn(this.currentUser(), order);

    // The permission says the role may cancel; the standing says this order is theirs to cancel —
    // its customer, its stall's vendor, or the desk.
    this.authorize(PERMISSION.ORDER_CANCEL);
    const actor: Actor = standing.customer
      ? 'customer'
      : standing.staff
        ? 'staff'
        : standing.store
          ? 'store'
          : 'system';
    if (actor === 'system') throw new ForbiddenError('Not your order');

    const updated = await this.changeStatus(orderId, ORDER_STATUS.CANCELLED, actor, reason);

    await this.publish(
      createEvent(ORDER_EVENT.CANCELLED, {
        orderId: order.id,
        number: order.number,
        customerId: order.customerId,
        storeId: order.storeId,
        cityId: order.addressCityId,
        reason,
        cancelledBy: actor === 'customer' ? 'customer' : actor === 'store' ? 'store' : 'staff',
        // Anything already paid online has to come back.
        refundable: order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'AUTHORIZED',
      }),
    );

    return updated;
  }

  /**
   * What was actually bought. Weighed goods: 2 kg of tomatoes is never exactly 2 kg. And the stall
   * may not have something — six flatbreads ordered and four left, or no dill at all: that line is
   * bought short or not at all (0) and leaves the bill, rather than the whole order failing over it.
   * The order is repriced before handover, so the customer pays for what they receive; money
   * already taken above the new total goes back by itself (the guarantee handler).
   *
   * It changes what the customer owes, so it is the courier carrying this order, at the stall, on
   * lines of this order, with numbers a scale or a count could show — and something must be left
   * to deliver: an empty bag is a failed order (`POST /delivery/:id/fail`), not a repriced one.
   */
  async reprice(orderId: string, actuals: ActualQuantity[]): Promise<OrderWithRelations> {
    const order = await this.getOrThrow(orderId);
    this.assertCarriedByCaller(order);
    if (!WEIGHING_STATUSES.includes(order.status)) {
      throw new ConflictError('The bill can only change while the courier is buying at the stall');
    }

    // Ids are matched against this order's own lines, never against the table: an id from another
    // order is simply not a line here.
    const lines = new Map(order.items.map((item) => [item.id, item]));
    if (new Set(actuals.map((actual) => actual.orderItemId)).size !== actuals.length) {
      throw new ConflictError('Each item may be weighed once');
    }
    for (const actual of actuals) {
      const item = lines.get(actual.orderItemId);
      if (item === undefined) throw new ConflictError('Only items of this order can be repriced');
      if (!isBuyableQuantity(item.unit, Number(item.quantity), actual.actualQuantity)) {
        throw new ConflictError('The quantity is out of range for the ordered one');
      }
      if (actual.photoUrl !== undefined && !/^https?:\/\//i.test(actual.photoUrl)) {
        throw new ConflictError('The scale photo must be a web address');
      }
    }
    // What each line ends up as: this report, else an earlier one, else what was ordered.
    const bought = (item: (typeof order.items)[number]) =>
      actuals.find((actual) => actual.orderItemId === item.id)?.actualQuantity ?? boughtSoFar(item);
    if (order.items.every((item) => bought(item) === 0)) {
      throw new ConflictError('Nothing is left to deliver: fail the order instead');
    }
    // Paid already: what goes back cannot be taken again, so from here the bill only goes down — a
    // line found after all, or a heavier weighing, is not handed over for money that is not there.
    if (
      order.paymentStatus === PAYMENT_STATUS.CAPTURED ||
      order.paymentStatus === PAYMENT_STATUS.PARTIALLY_REFUNDED
    ) {
      const subtotal = order.items.reduce(
        (sum, item) => sum + Math.round(item.unitPrice * bought(item)),
        0,
      );
      const total = Math.max(0, subtotal + order.deliveryFee + order.serviceFee - order.discount);
      if (total > order.total) {
        throw new ConflictError('The order is paid: its bill can only go down');
      }
    }
    // Newly not there, or counted goods newly short — what the customer has not been told yet; a
    // lighter weighing is the scale, not a shortage.
    const missing = actuals.flatMap((actual) => {
      const item = lines.get(actual.orderItemId);
      if (item === undefined) return [];
      const before = boughtSoFar(item);
      const now = actual.actualQuantity;
      const short = now === 0 || (!WEIGHTED_UNITS.includes(item.unit) && now < before);
      return short && now < before
        ? [{ orderItemId: item.id, name: item.name as Record<string, string>, quantity: now }]
        : [];
    });

    const { previousTotal, total } = await runInTransaction(this.prisma, (tx) =>
      this.repository.applyActualQuantities(orderId, actuals, tx, {
        courierId: order.courierId as string,
        statuses: WEIGHING_STATUSES,
      }),
    );

    await this.publish(
      createEvent(ORDER_EVENT.REPRICED, {
        orderId: order.id,
        number: order.number,
        customerId: order.customerId,
        storeId: order.storeId,
        cityId: order.addressCityId,
        previousTotal,
        total,
        currency: order.currency,
        missing,
      }),
    );

    return this.getOrThrow(orderId);
  }

  // ------------------------------------------------------------------ chat

  /**
   * The thread is the customer's, the courier's carrying the order and the desk's. A stall that
   * only gathers the goods can read the order, not the conversation at the customer's door.
   */
  private async chatParty(
    orderId: string,
  ): Promise<{ order: OrderWithRelations; role: 'CUSTOMER' | 'COURIER' | 'STAFF' }> {
    const order = await this.get(orderId);
    const user = this.currentUser();
    const standing = standingOn(user, order);
    if (standing.customer) return { order, role: 'CUSTOMER' };
    if (user.courierId !== undefined && user.courierId === order.courierId) {
      return { order, role: 'COURIER' };
    }
    if (standing.staff) return { order, role: 'STAFF' };
    throw new ForbiddenError('The chat is between the customer, the courier and the desk');
  }

  /** The newest 200, oldest first: a long thread must not hide what was said last. */
  async listMessages(orderId: string): Promise<ChatMessage[]> {
    const { order } = await this.chatParty(orderId);
    const latest = await this.prisma.chatMessage.findMany({
      where: { orderId, tenantId: order.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return latest.reverse();
  }

  async postMessage(orderId: string, text: string): Promise<ChatMessage> {
    const { order, role: senderRole } = await this.chatParty(orderId);
    const user = this.currentUser();
    if (isTerminal(order.status)) throw new ConflictError('The order is closed');
    const message = await this.prisma.chatMessage.create({
      data: { tenantId: order.tenantId, orderId, senderUserId: user.id, senderRole, text },
    });
    await this.publish(
      createEvent(ORDER_EVENT.MESSAGE, {
        orderId,
        number: order.number,
        customerId: order.customerId,
        storeId: order.storeId,
        cityId: order.addressCityId,
        courierId: order.courierId,
        message: {
          id: message.id,
          orderId,
          senderUserId: message.senderUserId,
          senderRole,
          text: message.text,
          createdAt: message.createdAt.toISOString(),
        },
      }),
    );
    return message;
  }

  /** Bazar Plus is active: delivery is free and the courier search starts wider. */
  private async isPlus(customerId: string): Promise<boolean> {
    const row = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { plusUntil: true },
    });
    return row?.plusUntil !== null && row?.plusUntil !== undefined && row.plusUntil > new Date();
  }

  private callerCustomerId(): string {
    const user = this.currentUser();
    this.authorize(PERMISSION.ORDER_CREATE);
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    return user.customerId;
  }

  /**
   * Whose order this is. A job placing a subscription's order names the customer; a request orders
   * as itself and as nobody else, whatever the caller passes in.
   */
  private orderingCustomerId(asCustomerId?: string): string {
    if (asCustomerId === undefined) return this.callerCustomerId();
    if (this.context().system === true) return asCustomerId;
    if (asCustomerId === this.callerCustomerId()) return asCustomerId;
    throw new ForbiddenError('Orders are placed as yourself');
  }

  /** The desk blocks a customer on the Customer row; the token they hold does not know. */
  private async assertMayOrder(customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: this.tenantId() },
      select: { blockedAt: true },
    });
    if (customer === null) throw new ForbiddenError('Customer profile required');
    if (customer.blockedAt !== null) {
      throw new AppError(ERROR_CODE.ACCOUNT_BLOCKED, 403, 'This account cannot place orders');
    }
  }

  /** Straight-line ride time at scooter speed plus the store's own preparation. */
  /**
   * B2B credit: an INVOICE order needs an operator-approved company, and the
   * open invoices plus this one must fit the limit. Returns the due date.
   */
  private async invoiceDueAt(method: PaymentMethod, customerId: string): Promise<Date | null> {
    if (method !== PAYMENT_METHOD.INVOICE) return null;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { businessApprovedAt: true, creditDays: true, creditLimit: true },
    });
    if (customer?.businessApprovedAt == null || customer.creditLimit <= 0) {
      throw new AppError(ERROR_CODE.CREDIT_LIMIT, 422, 'Invoice payment is not enabled');
    }
    return new Date(Date.now() + customer.creditDays * 86_400_000);
  }

  private async assertCredit(customerId: string, total: number): Promise<void> {
    const [customer, open] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { creditLimit: true } }),
      this.repository.unpaidInvoiceTotal(customerId),
    ]);
    if (open + total > (customer?.creditLimit ?? 0)) {
      throw new AppError(ERROR_CODE.CREDIT_LIMIT, 422, 'Credit limit exceeded');
    }
  }

  /** An operator saw the bank transfer: the invoice is paid. */
  async markInvoicePaid(orderId: string): Promise<OrderWithRelations> {
    this.authorize(PERMISSION.ORDER_UPDATE);
    const order = await this.get(orderId);
    // `order:update` is every vendor's: the stall must not be able to mark its own invoice paid.
    if (!standingOn(this.currentUser(), order).staff) {
      throw new ForbiddenError('Only the desk marks an invoice paid');
    }
    if (order.paymentMethod !== PAYMENT_METHOD.INVOICE) {
      throw new ConflictError('Only invoice orders are marked paid by hand');
    }
    return order;
  }

  private etaMinutesFor(store: { preparationMinutes: number }, distanceMeters: number): number {
    const rideMinutes = ((distanceMeters / 1000) * 1.3) / (VEHICLE_AVG_SPEED_KMH.SCOOTER / 60);
    return Math.ceil(store.preparationMinutes + rideMinutes + 5);
  }

  async get(orderId: string): Promise<OrderWithRelations> {
    const order = await this.getOrThrow(orderId);
    this.authorize(PERMISSION.ORDER_READ, this.partiesOf(order));
    return order;
  }

  async getByNumber(number: string): Promise<OrderWithRelations> {
    const order = await this.repository.findByNumber(number);
    if (order === null) throw new NotFoundError('Order', number);
    this.authorize(PERMISSION.ORDER_READ, this.partiesOf(order));
    return order;
  }

  /** Who may see this order without staff rights: the customer, the courier, the stall's vendor. */
  private partiesOf(order: OrderWithRelations) {
    return {
      tenantId: order.tenantId,
      customerId: order.customerId,
      vendorId: order.store.vendorId,
      ...(order.courierId !== null ? { courierId: order.courierId } : {}),
    };
  }

  /**
   * Non-staff callers only ever see their own orders, whatever they asked for:
   * the filter is overwritten rather than validated.
   */
  async list(filters: OrderListFilters): Promise<PaginatedResult<OrderWithRelations>> {
    const user = this.currentUser();
    this.authorize(PERMISSION.ORDER_READ);

    const scoped: OrderListFilters = { ...filters };
    if (!user.permissions.includes(PERMISSION.ORDER_READ_ANY)) {
      // The seller app asks for its stalls' orders: an account that is also somebody's customer
      // (the owner ordering for themselves) still sees the stall's orders there. Everyone else —
      // the customer app included, even with a storeId — gets what their own identity owns.
      if (filters.as === 'store' && user.vendorId !== undefined) {
        scoped.vendorId = user.vendorId;
      } else if (user.customerId !== undefined) scoped.customerId = user.customerId;
      else if (user.courierId !== undefined) scoped.courierId = user.courierId;
      else if (user.vendorId !== undefined) scoped.vendorId = user.vendorId;
      else throw new ForbiddenError('No orders visible to this account');
    }

    return this.repository.list(scoped);
  }

  /** Repeat order: same store, same items, priced fresh at today's rates. */
  async repeat(orderId: string, addressId?: string): Promise<OrderWithRelations> {
    const previous = await this.get(orderId);
    // The stall that gathered it and the courier that carried it may read the order, not reorder it:
    // a repeat is the customer's own basket again, at their own door.
    if (!standingOn(this.currentUser(), previous).customer) {
      throw new ForbiddenError('Only the customer repeats an order');
    }

    return this.create({
      storeId: previous.storeId,
      addressId: addressId ?? (await this.addresses.defaultFor(previous.customerId)),
      paymentMethod: previous.paymentMethod,
      items: previous.items
        .filter((item) => item.productId !== null)
        .map((item) => ({
          productId: item.productId as string,
          quantity: Number(item.quantity),
          comment: item.comment ?? undefined,
        })),
    });
  }

  async setEta(orderId: string, etaAt: Date | null): Promise<void> {
    await this.repository.setEta(orderId, etaAt);
  }

  /** Follows the payment; called from the payment event handlers only. */
  async setPaymentStatus(orderId: string, status: PaymentStatus): Promise<void> {
    await this.repository.setPaymentStatus(orderId, status);
  }

  async assignCourier(orderId: string, courierId: string): Promise<void> {
    await this.repository.assignCourier(orderId, courierId);
  }

  async releaseCourier(orderId: string): Promise<void> {
    await this.repository.releaseCourier(orderId);
  }

  private async getOrThrow(orderId: string): Promise<OrderWithRelations> {
    const order = await this.repository.findById(orderId);
    if (order === null) throw new NotFoundError('Order', orderId);
    return order;
  }

  /** Totals as Money, for callers that do arithmetic on them. */
  totalsOf(order: OrderWithRelations): OrderTotals {
    const currency = order.currency as Currency;
    return {
      subtotal: money(order.subtotal, currency),
      deliveryFee: money(order.deliveryFee, currency),
      serviceFee: money(order.serviceFee, currency),
      discount: money(order.discount, currency),
      total: money(order.total, currency),
    };
  }

  isFinished(status: OrderStatus): boolean {
    return isTerminal(status);
  }

  /**
   * Total weight, used to filter couriers by vehicle capacity.
   *
   * ponytail: 1 kg per KG/G unit and 500 g per piece, because OrderItem does
   * not snapshot the product weight. Good enough to keep a 20 kg sack off a
   * bicycle; copy weightGrams onto OrderItem if capacity ever has to be exact.
   */
  weightOf(order: OrderWithRelations): number {
    return order.items.reduce((grams, item) => {
      const quantity = Number(item.quantity);
      const perUnit = item.unit === 'KG' ? 1000 : item.unit === 'G' ? 1 : 500;
      return grams + quantity * perUnit;
    }, 0);
  }

  zeroFor(currency: Currency): Money {
    return zero(currency);
  }

  sum(values: Money[], currency: Currency): Money {
    return values.reduce((acc, value) => add(acc, value), zero(currency));
  }
}

/** Local aliases so the service reads like the contract it implements. */
type OrderQuote = OrderQuoteDto;

/** Stores a customer walks between with one courier: the rows of a bazaar. */
const STALL_TYPES: readonly string[] = [STORE_TYPE.BAZAAR_STALL, STORE_TYPE.ENTREPRENEUR];
type QuoteOrderInput = Omit<QuoteOrderDto, 'items'> & {
  items?: CreateOrderInput['items'];
  groupFollower?: boolean | undefined;
  groupSubtotal?: number | undefined;
};
type GroupEntry = { storeId: string; items: OrderItemInput[] };
type CreateGroupInput = Omit<
  CreateOrderInput,
  'storeId' | 'items' | 'groupId' | 'groupFollower'
> & {
  stores: GroupEntry[];
};
type QuoteGroupInput = Omit<QuoteOrderInput, 'storeId' | 'items' | 'groupFollower'> & {
  stores: GroupEntry[];
};

/** The refusal for a delivery window that is already under way (the clients translate it). */
const WINDOW_STARTED = 'The delivery window has already started';

function unquotable(reason: string, none: Money): OrderQuote {
  return {
    deliverable: false,
    reason,
    distanceMeters: 0,
    etaMinutes: 0,
    totals: { subtotal: none, deliveryFee: none, serviceFee: none, discount: none, total: none },
    minOrder: none,
    freeDeliveryThreshold: null,
    heavy: false,
    heavySurcharge: none,
  };
}
