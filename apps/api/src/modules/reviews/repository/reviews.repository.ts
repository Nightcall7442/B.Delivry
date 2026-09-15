/**
 * Reviews persistence (Prisma). Tenant-scoped.
 */
import type { Prisma, Review } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type {
  CreateReviewInput,
  RatingSummary,
  ReviewListFilters,
  ReviewTarget,
} from '../types/index.js';

export class ReviewsRepository extends BaseRepository {
  async create(input: CreateReviewInput, customerId: string): Promise<Review> {
    return this.prisma.review.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        orderId: input.orderId,
        customerId,
        target: input.target,
        targetId: input.targetId,
        rating: input.rating,
        comment: input.comment ?? null,
        photoUrls: input.photoUrls ?? [],
      },
    });
  }

  async findById(id: string): Promise<Review | null> {
    return this.prisma.review.findFirst({ where: this.scoped({ id }) });
  }

  /** The unique key is (orderId, target, targetId): one review per thing per order. */
  async exists(orderId: string, target: ReviewTarget, targetId: string): Promise<boolean> {
    const count = await this.prisma.review.count({ where: { orderId, target, targetId } });
    return count > 0;
  }

  async list(filters: ReviewListFilters): Promise<PaginatedResult<Review>> {
    const where: Prisma.ReviewWhereInput = {
      ...this.tenantScope(),
      ...(filters.orderId !== undefined ? { orderId: filters.orderId } : {}),
      ...(filters.target !== undefined ? { target: filters.target } : {}),
      ...(filters.targetId !== undefined ? { targetId: filters.targetId } : {}),
      ...(filters.customerId !== undefined ? { customerId: filters.customerId } : {}),
      ...(filters.minRating !== undefined ? { rating: { gte: filters.minRating } } : {}),
      // Customers only ever see published reviews; moderators pass this explicitly.
      published: filters.published ?? true,
    };

    return this.page(
      filters,
      async (page) =>
        (
          await this.prisma.review.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            ...page,
            include: {
              customer: { include: { user: { select: { firstName: true, lastName: true } } } },
            },
          })
        ).map(({ customer, ...review }) => ({
          ...review,
          authorName: authorName(customer.user.firstName, customer.user.lastName),
        })),
      () => this.prisma.review.count({ where }),
    );
  }

  async reply(id: string, reply: string): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { reply, repliedAt: new Date() },
    });
  }

  async setPublished(id: string, published: boolean): Promise<Review> {
    return this.prisma.review.update({ where: { id }, data: { published } });
  }

  /** Average plus the star histogram, in one grouped query. */
  async summary(target: ReviewTarget, targetId: string): Promise<RatingSummary> {
    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { ...this.tenantScope(), target, targetId, published: true },
      _count: true,
    });

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;

    for (const row of grouped) {
      const star = row.rating as 1 | 2 | 3 | 4 | 5;
      distribution[star] = row._count;
      total += row._count;
      sum += row.rating * row._count;
    }

    return {
      average: total === 0 ? 0 : Math.round((sum / total) * 10) / 10,
      count: total,
      distribution,
    };
  }
}

/** "Aziz K." — a name the stall can recognise, not a full identity. */
function authorName(first: string | null, last: string | null): string {
  const initial = last ? ` ${last.slice(0, 1)}.` : '';
  return first ? `${first}${initial}` : 'Покупатель';
}
