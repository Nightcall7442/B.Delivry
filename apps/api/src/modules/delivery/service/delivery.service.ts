/**
 * Delivery business logic. Delivery assignment, courier search, pickup/handover confirmations, proof photos.
 */
import {
  DELIVERY_TIMEOUTS,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  PERMISSION,
  SEARCH_RADIUS,
  type Currency,
  type OrderStatus,
} from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import { money } from '@bazar/payments';
import { tr } from '@bazar/storefront';
import type { Translated } from '@bazar/types';
import { randomDigits } from '@bazar/utils';
import type { Delivery } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/index.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { createEvent } from '../../../events/event-bus.js';
import type { RedisLock } from '../../../infrastructure/redis/distributed-lock.js';
import {
  courierSearchFailed,
  deliveryDuration,
} from '../../../infrastructure/telemetry/metrics.js';
import type { OrderWithRelations } from '../../orders/repository/orders.repository.js';
import type { OrdersService } from '../../orders/service/orders.service.js';
import type { PricingService } from '../../pricing/service/pricing.service.js';
import {
  RatingWeightedStrategy,
  type CourierMatchingStrategy,
} from '../domain/courier-matching.strategy.js';
import { DELIVERY_EVENT } from '../domain/delivery.events.js';
import type { DeliveryRepository } from '../repository/delivery.repository.js';
import type { CompleteInput, DeliveryListFilters, ScoredCandidate } from '../types/index.js';

export interface DeliveryServiceDeps extends ServiceDeps {
  repository: DeliveryRepository;
  orders: OrdersService;
  pricing: PricingService;
  lock: RedisLock;
  strategy?: CourierMatchingStrategy;
}

export class DeliveryService extends BaseService {
  private readonly repository: DeliveryRepository;
  private readonly orders: OrdersService;
  private readonly pricing: PricingService;
  private readonly lock: RedisLock;
  private readonly strategy: CourierMatchingStrategy;

  constructor(deps: DeliveryServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.orders = deps.orders;
    this.pricing = deps.pricing;
    this.lock = deps.lock;
    this.strategy = deps.strategy ?? new RatingWeightedStrategy();
  }

  /** Created when an order is confirmed; the trip the courier will be paid for. */
  async createForOrder(orderId: string): Promise<Delivery> {
    const existing = await this.repository.findByOrder(orderId);
    if (existing !== null) return existing;

    const order = await this.orders.get(orderId);
    const totals = this.orders.totalsOf(order);

    const pickup =
      order.store.lat === null || order.store.lng === null
        ? null
        : { lat: Number(order.store.lat), lng: Number(order.store.lng) };
    const dropoff =
      order.addressLat === null || order.addressLng === null
        ? null
        : { lat: Number(order.addressLat), lng: Number(order.addressLng) };

    // Straight-line for the record; the courier app shows the routed distance.
    const distanceMeters =
      pickup === null || dropoff === null ? 0 : Math.round(haversineMeters(pickup, dropoff));

    // The stall number is what the courier actually looks for at a bazaar, so
    // it leads the pickup address.
    const pickupAddress = [order.store.standNumber, order.store.address]
      .filter((part): part is string => part !== null && part.length > 0)
      .join(', ');

    return this.repository.create({
      orderId,
      pickup,
      pickupAddress,
      dropoff,
      dropoffAddress: order.addressFormatted,
      distanceMeters,
      // Free delivery is the platform's gift, not the courier's: pay from the real fee.
      payout: this.pricing.payoutFor(
        order.courierFee > 0
          ? money(order.courierFee, order.currency as Currency)
          : totals.deliveryFee,
      ).amount,
      currency: order.currency,
    });
  }

  /**
   * One round of the search. Returns the couriers that were offered the order,
   * so the job can decide whether to widen the radius and try again.
   *
   * Offers go to the top candidates simultaneously with a short TTL. Purely
   * sequential offers are fairer but too slow at rush hour: a customer will not
   * wait 30 seconds per courier for five couriers in a row.
   */
  async runSearch(orderId: string, radiusMeters: number): Promise<ScoredCandidate[]> {
    const delivery = await this.repository.findByOrder(orderId);
    if (delivery === null) throw new NotFoundError('Delivery for order', orderId);
    if (delivery.courierId !== null) return [];

    await this.repository.setSearching(delivery.id);

    const order = await this.orders.get(orderId);
    // First round: the customer sees "looking for a courier" from here on.
    if (order.status === ORDER_STATUS.CONFIRMED) {
      await this.orders.changeStatus(orderId, ORDER_STATUS.SEARCHING_COURIER, 'system');
    }
    if (delivery.pickupLat === null || delivery.pickupLng === null) {
      throw new AppError(ERROR_CODE.UNDELIVERABLE_ADDRESS, 422, 'Pickup point is unknown');
    }

    const pickup = { lat: Number(delivery.pickupLat), lng: Number(delivery.pickupLng) };
    const alreadyOffered = await this.repository.offeredCourierIds(delivery.id);

    const candidates = await this.repository.findCandidates(
      pickup,
      radiusMeters,
      order.addressCityId,
    );

    const ranked = this.strategy.rank(candidates, {
      orderId,
      pickup,
      dropoff: {
        lat: Number(delivery.dropoffLat ?? 0),
        lng: Number(delivery.dropoffLng ?? 0),
      },
      radiusMeters,
      weightGrams: this.orders.weightOf(order),
      excludeCourierIds: alreadyOffered,
    });

    // Three at a time: enough that someone usually accepts, few enough that a
    // courier is not constantly shown orders that vanish before they tap.
    const batch = ranked.slice(0, 3);
    const expiresAt = new Date(Date.now() + DELIVERY_TIMEOUTS.OFFER_TTL_SECONDS * 1000);

    await this.publish(
      createEvent(DELIVERY_EVENT.SEARCH_STARTED, {
        deliveryId: delivery.id,
        orderId,
        customerId: order.customerId,
        radiusMeters,
        attempt: delivery.attemptCount + 1,
      }),
    );

    for (const candidate of batch) {
      await this.repository.recordOffer(delivery.id, candidate.courierId, expiresAt);
      await this.publish(
        createEvent(DELIVERY_EVENT.OFFER_SENT, {
          deliveryId: delivery.id,
          orderId,
          customerId: order.customerId,
          courierId: candidate.courierId,
          expiresAt: expiresAt.toISOString(),
          orderNumber: order.number,
          storeName: tr(order.store.name as Translated, this.context().locale),
          pickupAddress: delivery.pickupAddress,
          dropoffAddress: delivery.dropoffAddress,
          distanceMeters: delivery.distanceMeters,
          payout: delivery.payout,
          currency: delivery.currency,
          itemCount: order.items.length,
          weightGrams: this.orders.weightOf(order),
        }),
      );
    }

    return batch;
  }

  /**
   * A courier taps accept. Two couriers can tap at the same instant, so the
   * claim is a guarded update and the loser gets a clear "already taken"
   * rather than a silent no-op.
   */
  async accept(deliveryId: string): Promise<Delivery> {
    const courierId = this.requireCourierId();
    this.authorize(PERMISSION.DELIVERY_ACCEPT);

    const claimed = await this.lock.withLock(`delivery:${deliveryId}`, 5000, async () => {
      const delivery = await this.repository.findById(deliveryId);
      if (delivery === null) throw new NotFoundError('Delivery', deliveryId);

      const offers = await this.repository.offeredCourierIds(deliveryId);
      if (!offers.includes(courierId)) {
        throw new AppError(ERROR_CODE.OFFER_EXPIRED, 409, 'This order was not offered to you');
      }

      return this.repository.claim(deliveryId, courierId);
    });

    if (claimed !== true) {
      throw new AppError(ERROR_CODE.COURIER_BUSY, 409, 'Another courier already took this order');
    }

    return this.assigned(deliveryId, courierId);
  }

  /**
   * The dispatcher hands the order to a courier by name — no offer, no
   * countdown. Used when the search found nobody, or when the operator knows
   * better than the ranking (a courier already at that bazaar).
   */
  async assign(deliveryId: string, courierId: string): Promise<Delivery> {
    this.authorize(PERMISSION.ORDER_ASSIGN);

    const claimed = await this.lock.withLock(`delivery:${deliveryId}`, 5000, async () => {
      const delivery = await this.repository.findById(deliveryId);
      if (delivery === null) throw new NotFoundError('Delivery', deliveryId);
      // The offer row is what accept() and the losers' notice key on.
      await this.repository.recordOffer(deliveryId, courierId, new Date());
      return this.repository.claim(deliveryId, courierId);
    });
    if (claimed !== true) {
      throw new AppError(ERROR_CODE.COURIER_BUSY, 409, 'This delivery already has a courier');
    }

    return this.assigned(deliveryId, courierId);
  }

  /** Puts a stalled order back on the market from the initial radius. */
  async restartSearch(deliveryId: string): Promise<void> {
    this.authorize(PERMISSION.ORDER_ASSIGN);
    const delivery = await this.getOrThrow(deliveryId);
    if (delivery.courierId !== null) {
      throw new ConflictError('Release the courier first; the delivery is assigned');
    }
    const order = await this.orders.get(delivery.orderId);
    // Everyone who declined or missed the first round is fair game again.
    await this.repository.clearOffers(deliveryId);
    await this.publish(
      createEvent(DELIVERY_EVENT.COURIER_RELEASED, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: '',
        reason: 'Search restarted by dispatcher',
      }),
    );
  }

  /** What happens after a claim, whoever made it. */
  private async assigned(deliveryId: string, courierId: string): Promise<Delivery> {
    const delivery = await this.getOrThrow(deliveryId);
    const offeredCourierIds = await this.repository.offeredCourierIds(deliveryId);

    // Assign before reading: the courier may only read orders they are on,
    // and until this write they are not on it.
    await this.orders.assignCourier(delivery.orderId, courierId);
    const order = await this.orders.get(delivery.orderId);
    // Hand-dispatched or a group follower: no search ever ran, so walk through it.
    if (order.status === ORDER_STATUS.CONFIRMED) {
      await this.orders.changeStatus(delivery.orderId, ORDER_STATUS.SEARCHING_COURIER, 'system');
    }
    if (order.status !== ORDER_STATUS.COURIER_ASSIGNED) {
      await this.orders.changeStatus(delivery.orderId, ORDER_STATUS.COURIER_ASSIGNED, 'system');
    }

    // The customer reads this code out on handover; it is what proves the
    // goods reached the right person for orders without a photo proof.
    await this.repository.setHandoverCode(deliveryId, randomDigits(4));

    await this.publish(
      createEvent(DELIVERY_EVENT.COURIER_ASSIGNED, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId,
        etaSeconds: null,
        payout: delivery.payout,
        offeredCourierIds,
      }),
    );

    await this.followGroup(order, courierId);
    return this.getOrThrow(deliveryId);
  }

  /**
   * Cross-bazaar: the moment one order of a group has a courier, its confirmed
   * siblings go to the same courier — no offer, no search, no concurrency
   * check: it is one trip.
   */
  private async followGroup(order: OrderWithRelations, courierId: string): Promise<void> {
    if (order.groupId === null) return;
    const siblings = await this.orders.group(order.groupId);
    for (const sibling of siblings) {
      if (sibling.id === order.id || sibling.courierId !== null) continue;
      if (
        sibling.status !== ORDER_STATUS.CONFIRMED &&
        sibling.status !== ORDER_STATUS.SEARCHING_COURIER
      ) {
        continue;
      }
      await this.assignSibling(sibling.id, courierId);
    }
  }

  /** Direct assignment for a group follower (also used when the follower confirms late). */
  async assignSibling(orderId: string, courierId: string): Promise<void> {
    const delivery = await this.createForOrder(orderId);
    if (delivery.courierId !== null) return;
    await this.repository.recordOffer(delivery.id, courierId, new Date());
    if ((await this.repository.claim(delivery.id, courierId)) !== true) return;
    await this.assigned(delivery.id, courierId);
  }

  async decline(deliveryId: string): Promise<void> {
    const courierId = this.requireCourierId();
    await this.repository.decline(deliveryId, courierId);
  }

  /** Courier gives the order back; it returns to the pool for a fresh search. */
  async release(deliveryId: string, reason: string): Promise<void> {
    const delivery = await this.getOrThrow(deliveryId);
    if (delivery.courierId === null) return;

    const order = await this.orders.get(delivery.orderId);

    await this.repository.release(deliveryId);
    await this.orders.releaseCourier(delivery.orderId);
    await this.orders.changeStatus(
      delivery.orderId,
      ORDER_STATUS.SEARCHING_COURIER,
      'staff',
      reason,
    );

    await this.publish(
      createEvent(DELIVERY_EVENT.COURIER_RELEASED, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: delivery.courierId,
        reason,
      }),
    );
  }

  /** Nobody accepted within the search window: hand it to a human. */
  async exhausted(orderId: string, attempts: number, lastRadiusMeters: number): Promise<void> {
    const delivery = await this.repository.findByOrder(orderId);
    if (delivery === null || delivery.courierId !== null) return;

    const order = await this.orders.get(orderId);
    courierSearchFailed.inc();

    await this.publish(
      createEvent(DELIVERY_EVENT.SEARCH_EXHAUSTED, {
        deliveryId: delivery.id,
        orderId,
        customerId: order.customerId,
        attempts,
        lastRadiusMeters,
      }),
    );
  }

  /**
   * The courier app has four buttons; the order has nine statuses. Each tap
   * walks the order through every stage up to the one it means, applying only
   * the moves that are legal from where the order is, so a courier who never
   * tapped "arrived" still leaves a complete status history behind.
   */
  private async advanceOrder(orderId: string, target: OrderStatus): Promise<void> {
    const path: OrderStatus[] = [
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      ORDER_STATUS.PICKING_UP,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.IN_DELIVERY,
      ORDER_STATUS.COURIER_ARRIVED,
      ORDER_STATUS.DELIVERED,
    ];
    let current = (await this.orders.get(orderId)).status;
    for (const next of path) {
      if (ORDER_STATUS_TRANSITIONS[current].includes(next)) {
        await this.orders.changeStatus(orderId, next, 'courier');
        current = next;
      }
      if (next === target) return;
    }
  }

  async arrivedAtPickup(deliveryId: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    await this.repository.setStatus(deliveryId, 'AT_PICKUP');
    await this.advanceOrder(delivery.orderId, ORDER_STATUS.COURIER_ARRIVED_PICKUP);
    return this.getOrThrow(deliveryId);
  }

  /** Goods are in the bag and the courier is leaving the stall. */
  async pickedUp(deliveryId: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    await this.repository.setStatus(deliveryId, 'PICKED_UP', { pickedUpAt: new Date() });
    await this.advanceOrder(delivery.orderId, ORDER_STATUS.IN_DELIVERY);

    const order = await this.orders.get(delivery.orderId);
    await this.publish(
      createEvent(DELIVERY_EVENT.PICKED_UP, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: delivery.courierId as string,
      }),
    );

    return this.getOrThrow(deliveryId);
  }

  /** At the door: the customer gets the "come down" nudge. */
  async arrivedAtDropoff(deliveryId: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    await this.repository.setStatus(deliveryId, 'AT_DROPOFF');
    await this.advanceOrder(delivery.orderId, ORDER_STATUS.COURIER_ARRIVED);

    const order = await this.orders.get(delivery.orderId);
    await this.publish(
      createEvent(DELIVERY_EVENT.ARRIVED_DROPOFF, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: delivery.courierId as string,
      }),
    );
    return this.getOrThrow(deliveryId);
  }

  /**
   * Handover. The code check is the one thing that must not be skippable:
   * without it a courier could mark an order delivered from the next street.
   */
  async complete(deliveryId: string, input: CompleteInput): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    this.authorize(PERMISSION.DELIVERY_COMPLETE);

    if (delivery.proofType === 'CODE') {
      if (input.handoverCode !== delivery.handoverCode) {
        throw new AppError(ERROR_CODE.INVALID_HANDOVER_CODE, 422, 'Handover code does not match');
      }
    }
    if (delivery.proofType === 'PHOTO' && input.proofUrl === undefined) {
      throw new ConflictError('A delivery photo is required for this order');
    }

    const order = await this.orders.get(delivery.orderId);

    await this.repository.setStatus(deliveryId, 'DELIVERED', {
      deliveredAt: new Date(),
      proofUrl: input.proofUrl ?? null,
    });
    await this.advanceOrder(delivery.orderId, ORDER_STATUS.DELIVERED);

    if (delivery.assignedAt !== null) {
      deliveryDuration.observe((Date.now() - delivery.assignedAt.getTime()) / 1000);
    }

    // Cash orders leave the courier holding the platform's money until they
    // settle up; the wallet ledger is where that debt lives.
    const cashCollected = order.paymentMethod === 'CASH' ? order.total : 0;

    await this.publish(
      createEvent(DELIVERY_EVENT.DELIVERED, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: delivery.courierId as string,
        payout: delivery.payout,
        cashCollected,
        orderTotal: order.total,
        courierUserId: this.currentUser().id,
      }),
    );

    return this.getOrThrow(deliveryId);
  }

  async fail(deliveryId: string, reason: string, photoUrl?: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    const order = await this.orders.get(delivery.orderId);

    await this.repository.setStatus(deliveryId, 'FAILED', {
      failureReason: reason,
      proofUrl: photoUrl ?? null,
    });
    await this.orders.changeStatus(delivery.orderId, ORDER_STATUS.FAILED, 'courier', reason);

    await this.publish(
      createEvent(DELIVERY_EVENT.FAILED, {
        deliveryId,
        orderId: delivery.orderId,
        customerId: order.customerId,
        courierId: delivery.courierId,
        reason,
      }),
    );

    return this.getOrThrow(deliveryId);
  }

  async list(filters: DeliveryListFilters): Promise<PaginatedResult<Delivery>> {
    const user = this.currentUser();
    this.authorize(PERMISSION.DELIVERY_READ);

    // A courier only ever sees their own trips, whatever they filtered by.
    const scoped =
      user.courierId !== undefined ? { ...filters, courierId: user.courierId } : filters;

    return this.repository.list(scoped);
  }

  async activeForCourier(): Promise<Delivery[]> {
    return this.repository.activeForCourier(this.requireCourierId());
  }

  async get(deliveryId: string): Promise<Delivery> {
    const delivery = await this.getOrThrow(deliveryId);
    this.authorize(PERMISSION.DELIVERY_READ, {
      tenantId: delivery.tenantId,
      ...(delivery.courierId !== null ? { courierId: delivery.courierId } : {}),
    });
    return delivery;
  }

  async setEta(deliveryId: string, etaAt: Date | null): Promise<void> {
    await this.repository.setEta(deliveryId, etaAt);
  }

  async findByOrder(orderId: string): Promise<Delivery | null> {
    return this.repository.findByOrder(orderId);
  }

  /** Widened radius for the next search round, capped so it stays plausible. */
  nextRadius(current: number): number | null {
    const next = current + SEARCH_RADIUS.COURIER_STEP_METERS;
    return next > SEARCH_RADIUS.COURIER_MAX_METERS ? null : next;
  }

  private requireCourierId(): string {
    const courierId = this.currentUser().courierId;
    if (courierId === undefined) throw new ForbiddenError('Courier profile required');
    return courierId;
  }

  private async getOrThrow(deliveryId: string): Promise<Delivery> {
    const delivery = await this.repository.findById(deliveryId);
    if (delivery === null) throw new NotFoundError('Delivery', deliveryId);
    return delivery;
  }

  /** Only the assigned courier may report progress on a trip. */
  private async assertOwnDelivery(deliveryId: string): Promise<Delivery> {
    const delivery = await this.getOrThrow(deliveryId);
    const courierId = this.requireCourierId();
    if (delivery.courierId !== courierId) {
      throw new ForbiddenError('This delivery is assigned to another courier');
    }
    return delivery;
  }

  currencyOf(delivery: Delivery): Currency {
    return delivery.currency as Currency;
  }
}
