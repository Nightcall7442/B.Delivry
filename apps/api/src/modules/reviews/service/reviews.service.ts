/**
 * Reviews business logic. Verified-purchase reviews, replies, moderation.
 */
import { ORDER_STATUS, PERMISSION } from '@bazar/constants';
import type { Review } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CouriersService } from '../../couriers/service/couriers.service.js';
import type { OrdersService } from '../../orders/service/orders.service.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type { ReviewsRepository } from '../repository/reviews.repository.js';
import type {
  CreateReviewInput,
  RatingSummary,
  ReviewListFilters,
  ReviewTarget,
} from '../types/index.js';

export interface ReviewsServiceDeps extends ServiceDeps {
  repository: ReviewsRepository;
  orders: OrdersService;
  stores: StoresService;
  couriers: CouriersService;
}

export class ReviewsService extends BaseService {
  private readonly repository: ReviewsRepository;
  private readonly orders: OrdersService;
  private readonly stores: StoresService;
  private readonly couriers: CouriersService;

  constructor(deps: ReviewsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.orders = deps.orders;
    this.stores = deps.stores;
    this.couriers = deps.couriers;
  }

  /**
   * Only a customer who actually received the order may review it, and only
   * once per target. Without that check the ratings are worth nothing.
   */
  async create(input: CreateReviewInput): Promise<Review> {
    const user = this.currentUser();
    const customerId = user.customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');

    const order = await this.orders.get(input.orderId);

    if (order.customerId !== customerId) {
      throw new ForbiddenError('You can only review your own orders');
    }
    if (order.status !== ORDER_STATUS.DELIVERED) {
      throw new ConflictError('Only a delivered order can be reviewed');
    }

    this.assertTargetBelongsToOrder(input, order);

    if (await this.repository.exists(input.orderId, input.target, input.targetId)) {
      throw new ConflictError('You have already reviewed this');
    }

    const review = await this.repository.create(input, customerId);
    await this.refreshTargetRating(input.target, input.targetId);

    return review;
  }

  /** A review must point at something that was actually part of the order. */
  private assertTargetBelongsToOrder(
    input: CreateReviewInput,
    order: { storeId: string; courierId: string | null; items: { productId: string | null }[] },
  ): void {
    const valid =
      (input.target === 'STORE' && input.targetId === order.storeId) ||
      (input.target === 'COURIER' && input.targetId === order.courierId) ||
      (input.target === 'PRODUCT' && order.items.some((item) => item.productId === input.targetId));

    if (!valid) throw new ConflictError('That is not part of this order');
  }

  async list(filters: ReviewListFilters): Promise<PaginatedResult<Review>> {
    // Reading unpublished reviews is moderation, not browsing.
    if (filters.published === false) this.authorize(PERMISSION.SUPPORT_HANDLE);
    return this.repository.list(filters);
  }

  async summary(target: ReviewTarget, targetId: string): Promise<RatingSummary> {
    return this.repository.summary(target, targetId);
  }

  /** Vendor or courier answering a review about them. */
  async reply(id: string, reply: string): Promise<Review> {
    const review = await this.getOrThrow(id);
    const user = this.currentUser();

    const owns =
      (review.target === 'COURIER' && review.targetId === user.courierId) ||
      (review.target === 'STORE' && (await this.ownsStore(review.targetId)));

    if (!owns) this.authorize(PERMISSION.SUPPORT_HANDLE);
    if (review.reply !== null) throw new ConflictError('This review already has a reply');

    return this.repository.reply(id, reply);
  }

  /** Moderation: hide abusive or off-topic content without deleting evidence. */
  async setPublished(id: string, published: boolean): Promise<Review> {
    this.authorize(PERMISSION.SUPPORT_HANDLE);
    const review = await this.getOrThrow(id);
    const updated = await this.repository.setPublished(id, published);
    await this.refreshTargetRating(review.target, review.targetId);
    return updated;
  }

  /**
   * Ratings on stores and couriers are recomputed from their reviews rather
   * than incremented, so hiding a review actually moves the average.
   */
  private async refreshTargetRating(target: ReviewTarget, targetId: string): Promise<void> {
    if (target === 'STORE') await this.stores.refreshRating(targetId);
    if (target === 'COURIER') await this.couriers.refreshRating(targetId);
  }

  private async ownsStore(storeId: string): Promise<boolean> {
    const store = await this.stores.get(storeId);
    return store.vendorId === this.currentUser().vendorId;
  }

  private async getOrThrow(id: string): Promise<Review> {
    const review = await this.repository.findById(id);
    if (review === null) throw new NotFoundError('Review', id);
    return review;
  }
}
