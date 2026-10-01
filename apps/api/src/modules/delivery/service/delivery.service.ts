/**
 * Delivery business logic. Delivery assignment, courier search, pickup/handover confirmations, proof photos.
 */
import {
  COURIER_STATUS,
  DELIVERY_TIMEOUTS,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  PERMISSION,
  SEARCH_RADIUS,
  isTerminalOrderStatus,
  type Currency,
  type DeliveryStatus,
  type OrderStatus,
} from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import { money } from '@bazar/payments';
import { tr } from '@bazar/storefront';
import type { DeliveryOfferDto, Translated } from '@bazar/types';
import { randomDigits } from '@bazar/utils';
import type { Delivery, Prisma } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { money as moneyDto } from '../../../common/dto/index.js';
import { runWithContext } from '../../../common/tenant/tenant-context.js';
import { systemContext } from '../../../common/types/request-context.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
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
import {
  ACTIVE_DELIVERY_STATUSES,
  type CourierStanding,
  type DeliveryRepository,
} from '../repository/delivery.repository.js';
import type { CompleteInput, DeliveryListFilters, ScoredCandidate } from '../types/index.js';

/**
 * The courier app speaks Russian only, so an offer names the stall in Russian whether the socket
 * pushed it (from a job that runs in Uzbek) or the app asked for it (in the courier's own locale).
 */
const COURIER_LOCALE = 'ru';

/** A tap can still land this long after its offer ran out: the request was already on the wire. */
const OFFER_GRACE_MS = 3_000;

/** Where an order waits for a courier. Anywhere else it has moved on, and a courier must not be put on it. */
const AWAITING_COURIER: readonly OrderStatus[] = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.SEARCHING_COURIER,
];

/** How far a live trip has got, so a step can only go forward. */
const TRIP_RANK: Partial<Record<DeliveryStatus, number>> = {
  ASSIGNED: 0,
  AT_PICKUP: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 2,
  AT_DROPOFF: 3,
  DELIVERED: 4,
};

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
          storeName: tr(order.store.name as Translated, COURIER_LOCALE),
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
    const courier = await this.workingCourier(courierId);

    // The courier's own lock is outside the delivery's: two offers answered together by one courier
    // are taken one after the other, so the capacity count below is not beaten by the second.
    const outcome = await this.lock.withLock(`courier:${courierId}`, 5000, () =>
      this.lock.withLock(`delivery:${deliveryId}`, 5000, async () => {
        const delivery = await this.repository.findById(deliveryId);
        if (delivery === null) throw new NotFoundError('Delivery', deliveryId);

        const offer = await this.repository.findOffer(deliveryId, courierId);
        // A retry of an accept that went through (the answer was lost on the way back): already theirs.
        if (delivery.courierId === courierId && offer?.acceptedAt != null) return 'mine' as const;
        // An offer is open until it is answered or runs out: one that was declined, taken or has
        // expired is not a licence to take the order later.
        if (
          offer === null ||
          offer.acceptedAt !== null ||
          offer.declinedAt !== null ||
          offer.expiresAt.getTime() + OFFER_GRACE_MS < Date.now()
        ) {
          throw new AppError(ERROR_CODE.OFFER_EXPIRED, 409, 'This order is not on offer to you');
        }

        await this.assertAwaitsCourier(delivery.orderId, courier);
        const carrying = await this.repository.activeForCourier(courierId);
        if (carrying.length >= courier.maxConcurrentOrders) {
          throw new AppError(
            ERROR_CODE.COURIER_BUSY,
            409,
            'You are already carrying as many orders as you take',
          );
        }

        return (await this.repository.claim(deliveryId, courierId))
          ? ('claimed' as const)
          : ('taken' as const);
      }),
    );

    if (outcome === 'mine') return this.getOrThrow(deliveryId);
    if (outcome !== 'claimed') {
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
    // The desk names a courier by id: one of this tenant's, verified, not suspended, on shift.
    const courier = await this.workingCourier(courierId);

    const claimed = await this.lock.withLock(`delivery:${deliveryId}`, 5000, async () => {
      const delivery = await this.repository.findById(deliveryId);
      if (delivery === null) throw new NotFoundError('Delivery', deliveryId);
      await this.assertAwaitsCourier(delivery.orderId, courier);
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
    if (!AWAITING_COURIER.includes(order.status)) {
      throw new ConflictError('The order no longer needs a courier');
    }
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
    // As the platform: the caller is the courier who just took the leader (or the desk), and a
    // sibling is not theirs to read until this very write makes it so.
    const platform = systemContext(this.tenantId(), `group:${order.id}`, this.context().locale);
    for (const sibling of siblings) {
      if (sibling.id === order.id || sibling.courierId !== null) continue;
      if (
        sibling.status !== ORDER_STATUS.CONFIRMED &&
        sibling.status !== ORDER_STATUS.SEARCHING_COURIER
      ) {
        continue;
      }
      await runWithContext(platform, () => this.assignSibling(sibling.id, courierId));
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
    this.authorize(PERMISSION.ORDER_ASSIGN);
    const delivery = await this.getOrThrow(deliveryId);
    if (delivery.courierId === null) return;

    const order = await this.orders.get(delivery.orderId);
    // The order is read before anything is reset: one the courier already has the goods of (or that
    // is over) cannot go back to the search, and refusing it afterwards would leave a trip without a courier.
    if (!ORDER_STATUS_TRANSITIONS[order.status].includes(ORDER_STATUS.SEARCHING_COURIER)) {
      throw new InvalidStateTransitionError(order.status, ORDER_STATUS.SEARCHING_COURIER);
    }

    if (!(await this.repository.release(deliveryId, delivery.courierId))) {
      throw new ConflictError('The delivery changed while it was being released, retry');
    }
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
      if (next === target) break;
    }
    // The order may have been cancelled or failed in the moment since the caller looked: a trip must
    // not report a step its order never took (it would be paid out for a closed order).
    if (path.indexOf(current) < path.indexOf(target))
      throw new ConflictError('The order is closed');
  }

  /**
   * One step of the courier's own trip, and the only way a trip moves forward. The trip must still be
   * live, the step must go forward, and its order must still be open: a trip finished twice would
   * pay the courier twice, one stepped back would reopen a delivered order, and one whose order was
   * cancelled under the courier would still pay out.
   *
   * The order moves first, because its status is the compare-and-swap that lets one of two
   * simultaneous requests through; the delivery row follows, guarded by the status it moves from. A
   * step that finds the trip already there (a double tap, a retry after a lost answer) does nothing
   * and reports `moved: false`, so no event is published twice.
   */
  private async step(
    delivery: Delivery,
    to: DeliveryStatus,
    orderTarget: OrderStatus,
    extra: Prisma.DeliveryUncheckedUpdateManyInput = {},
  ): Promise<{ delivery: Delivery; order: OrderWithRelations; moved: boolean }> {
    const order = await this.orders.get(delivery.orderId);
    const courierId = delivery.courierId as string;
    if (delivery.status === to) return { delivery, order, moved: false };

    const here = TRIP_RANK[delivery.status];
    const there = TRIP_RANK[to] as number;
    if (here === undefined || there <= here) {
      throw new ConflictError(`The trip is already ${delivery.status}`);
    }
    if (isTerminalOrderStatus(order.status)) throw new ConflictError('The order is closed');

    await this.advanceOrder(delivery.orderId, orderTarget);

    const from = ACTIVE_DELIVERY_STATUSES.filter((status) => (TRIP_RANK[status] ?? 99) < there);
    if (await this.repository.transition(delivery.id, courierId, from, to, extra)) {
      return { delivery: await this.getOrThrow(delivery.id), order, moved: true };
    }
    // Lost the race: whoever won made the same step, or the trip moved on and this one is stale.
    const fresh = await this.getOrThrow(delivery.id);
    if (fresh.status === to && fresh.courierId === courierId) {
      return { delivery: fresh, order, moved: false };
    }
    throw new ConflictError('The delivery changed meanwhile, refresh and retry');
  }

  async arrivedAtPickup(deliveryId: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    return (await this.step(delivery, 'AT_PICKUP', ORDER_STATUS.COURIER_ARRIVED_PICKUP)).delivery;
  }

  /** Goods are in the bag and the courier is leaving the stall. */
  async pickedUp(deliveryId: string): Promise<Delivery> {
    const owned = await this.assertOwnDelivery(deliveryId);
    const { delivery, order, moved } = await this.step(
      owned,
      'PICKED_UP',
      ORDER_STATUS.IN_DELIVERY,
      { pickedUpAt: new Date() },
    );
    if (moved) {
      await this.publish(
        createEvent(DELIVERY_EVENT.PICKED_UP, {
          deliveryId,
          orderId: delivery.orderId,
          customerId: order.customerId,
          courierId: delivery.courierId as string,
        }),
      );
    }
    return delivery;
  }

  /** At the door: the customer gets the "come down" nudge. */
  async arrivedAtDropoff(deliveryId: string): Promise<Delivery> {
    const owned = await this.assertOwnDelivery(deliveryId);
    const { delivery, order, moved } = await this.step(
      owned,
      'AT_DROPOFF',
      ORDER_STATUS.COURIER_ARRIVED,
    );
    if (moved) {
      await this.publish(
        createEvent(DELIVERY_EVENT.ARRIVED_DROPOFF, {
          deliveryId,
          orderId: delivery.orderId,
          customerId: order.customerId,
          courierId: delivery.courierId as string,
        }),
      );
    }
    return delivery;
  }

  /**
   * Handover. The code check is the one thing that must not be skippable:
   * without it a courier could mark an order delivered from the next street.
   */
  async complete(deliveryId: string, input: CompleteInput): Promise<Delivery> {
    const owned = await this.assertOwnDelivery(deliveryId);
    this.authorize(PERMISSION.DELIVERY_COMPLETE);
    // Completed already: answer again, change nothing — the payout and the cash were booked the first time.
    if (owned.status === 'DELIVERED') return owned;

    if (owned.proofType === 'CODE') {
      if (input.handoverCode !== owned.handoverCode) {
        throw new AppError(ERROR_CODE.INVALID_HANDOVER_CODE, 422, 'Handover code does not match');
      }
    }
    if (owned.proofType === 'PHOTO' && input.proofUrl === undefined) {
      throw new ConflictError('A delivery photo is required for this order');
    }

    const { delivery, order, moved } = await this.step(owned, 'DELIVERED', ORDER_STATUS.DELIVERED, {
      deliveredAt: new Date(),
      proofUrl: input.proofUrl ?? null,
    });
    if (!moved) return delivery;

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

    return delivery;
  }

  async fail(deliveryId: string, reason: string, photoUrl?: string): Promise<Delivery> {
    const delivery = await this.assertOwnDelivery(deliveryId);
    if (delivery.status === 'FAILED') return delivery;
    if (TRIP_RANK[delivery.status] === undefined || delivery.status === 'DELIVERED') {
      throw new ConflictError(`The trip is already ${delivery.status}`);
    }
    const order = await this.orders.get(delivery.orderId);
    if (isTerminalOrderStatus(order.status)) throw new ConflictError('The order is closed');

    // The order says whether the trip may fail from where it stands, so it goes first and a refusal
    // leaves the delivery alone. The table lets an order fail from the moment of gathering, not from
    // the way to the stall or the arrival at it, and the courier app offers «no goods» at both: the
    // order is walked to that moment first, as a tap on "picked up" would walk it.
    if (
      order.status === ORDER_STATUS.COURIER_ASSIGNED ||
      order.status === ORDER_STATUS.COURIER_ARRIVED_PICKUP
    ) {
      await this.advanceOrder(delivery.orderId, ORDER_STATUS.PICKING_UP);
    }
    await this.orders.changeStatus(delivery.orderId, ORDER_STATUS.FAILED, 'courier', reason);

    const moved = await this.repository.transition(
      deliveryId,
      delivery.courierId as string,
      ACTIVE_DELIVERY_STATUSES,
      'FAILED',
      { failureReason: reason, proofUrl: photoUrl ?? null },
    );
    if (!moved) {
      const fresh = await this.getOrThrow(deliveryId);
      if (fresh.status === 'FAILED') return fresh;
      throw new ConflictError('The delivery changed meanwhile, refresh and retry');
    }

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

    // A courier only ever sees their own trips, whatever they filtered by. Without a courier profile
    // only the desk reads on: delivery:read alone must not open every trip of the tenant.
    if (user.courierId === undefined && !this.callerIsStaff()) {
      throw new ForbiddenError('Courier profile required');
    }
    const scoped =
      user.courierId !== undefined ? { ...filters, courierId: user.courierId } : filters;

    return this.repository.list(scoped);
  }

  async activeForCourier(): Promise<Delivery[]> {
    return this.repository.activeForCourier(this.requireCourierId());
  }

  /**
   * The offer cards this courier can still answer, as the socket would have pushed them. A socket
   * that was reconnecting when an offer went out loses it for good; the app also asks here.
   */
  async pendingOffers(): Promise<DeliveryOfferDto[]> {
    const courierId = this.requireCourierId();
    const locale = this.context().locale;
    const rows = await this.repository.pendingOffersFor(courierId, new Date());
    // The order is not the courier's yet, so it is read as the platform, as the search job does.
    const platform = systemContext(this.tenantId(), `offers:${courierId}`, locale);

    return Promise.all(
      rows.map(async ({ delivery, expiresAt }) => {
        const order = await runWithContext(platform, () => this.orders.get(delivery.orderId));
        return {
          deliveryId: delivery.id,
          orderId: delivery.orderId,
          orderNumber: order.number,
          storeName: tr(order.store.name as Translated, COURIER_LOCALE),
          pickupAddress: delivery.pickupAddress,
          dropoffAddress: delivery.dropoffAddress,
          distanceMeters: delivery.distanceMeters,
          payout: moneyDto(delivery.payout, delivery.currency),
          itemCount: order.items.length,
          weightGrams: this.orders.weightOf(order),
          expiresAt: expiresAt.toISOString(),
        };
      }),
    );
  }

  async get(deliveryId: string): Promise<Delivery> {
    const delivery = await this.getOrThrow(deliveryId);
    // The lookup above is the tenant's. The desk reads any trip in it — there is no delivery:read_any
    // for can() to find, so naming the resource would turn every operator away — and a courier
    // reads the one they carry.
    if (this.callerIsStaff()) this.authorize(PERMISSION.DELIVERY_READ);
    else {
      this.authorize(PERMISSION.DELIVERY_READ, {
        tenantId: delivery.tenantId,
        ...(delivery.courierId !== null ? { courierId: delivery.courierId } : {}),
      });
    }
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

  /** The desk: operators and admins, who see every order and trip of the tenant. */
  private callerIsStaff(): boolean {
    return this.context().user?.permissions.includes(PERMISSION.ORDER_READ_ANY) === true;
  }

  /**
   * A courier who may take work: of this tenant, verified, not suspended, on shift (online, or
   * busy on a trip). Offers go only to such couriers; this holds the same line for a courier who
   * was suspended or went off shift after one arrived, and for an id the desk typed.
   */
  private async workingCourier(courierId: string): Promise<CourierStanding> {
    const courier = await this.repository.findCourier(courierId);
    if (courier === null) throw new NotFoundError('Courier', courierId);
    if (courier.status === COURIER_STATUS.SUSPENDED) {
      throw new ForbiddenError('This courier account is suspended');
    }
    if (courier.verifiedAt === null) {
      throw new ForbiddenError('The courier account is waiting for verification');
    }
    if (courier.status !== COURIER_STATUS.ONLINE && courier.status !== COURIER_STATUS.BUSY) {
      throw new ConflictError('The courier is not on shift');
    }
    return courier;
  }

  /**
   * The order must still be waiting for a courier. It is read as the platform: the courier it is
   * about to be given to is not on it yet, so they could not read it as themselves.
   */
  private async assertAwaitsCourier(orderId: string, courier: CourierStanding): Promise<void> {
    const platform = systemContext(this.tenantId(), `claim:${orderId}`, this.context().locale);
    const order = await runWithContext(platform, () => this.orders.get(orderId));
    if (!AWAITING_COURIER.includes(order.status)) {
      throw new ConflictError('The order no longer needs a courier');
    }
    // A neighbour courier is also somebody's customer: they must not carry, and be paid for, their own order.
    const buyer = order.customer?.userId;
    if (buyer !== undefined && buyer === courier.userId) {
      throw new ForbiddenError('You cannot carry your own order');
    }
  }

  /** Only the assigned courier may report progress on a trip. */
  private async assertOwnDelivery(deliveryId: string): Promise<Delivery> {
    // The profile first: whether a delivery id exists is not for a caller without one to find out.
    const courierId = this.requireCourierId();
    const delivery = await this.getOrThrow(deliveryId);
    if (delivery.courierId !== courierId) {
      throw new ForbiddenError('This delivery is assigned to another courier');
    }
    return delivery;
  }

  currencyOf(delivery: Delivery): Currency {
    return delivery.currency as Currency;
  }
}
