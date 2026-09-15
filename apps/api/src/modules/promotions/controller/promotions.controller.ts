/**
 * Promotions HTTP controller — thin: validate → call service → map response.
 */
import type { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { ForbiddenError } from '../../../common/errors/domain.errors.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { PromotionsService } from '../service/promotions.service.js';
import type { PromotionListQuery } from '../schemas/index.js';

export class PromotionsController extends BaseController {
  constructor(private readonly service: PromotionsService) {
    super();
  }

  /** Checkout preview: answers with a reason instead of an error page. */
  preview = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<{
      code: string;
      storeId: string;
      subtotal: { amount: number; currency: string };
    }>(request);
    const customerId = request.user?.customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');

    return this.ok(
      reply,
      await this.service.preview(
        input.code,
        input.storeId,
        this.service.moneyFor(input.subtotal.amount, input.subtotal.currency as 'UZS'),
        customerId,
      ),
    );
  };

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.listPromotions(query<PromotionListQuery>(request)));

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.createPromotion(promotionData(body(request))));

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.updatePromotion(id, promotionData(body(request))));
  };

  createCoupon = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(
      reply,
      await this.service.createCoupon(body<Prisma.CouponUncheckedCreateInput>(request)),
    );

  listCoupons = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.listCoupons(id));
  };

  deactivateCoupon = async (request: FastifyRequest, reply: FastifyReply) => {
    const { couponId } = params<{ couponId: string }>(request);
    await this.service.deactivateCoupon(couponId);
    this.noContent(reply);
  };
}

/**
 * Money arrives as { amount, currency } and is stored as an integer column;
 * dates arrive as ISO strings. Flattened here so the service and repository
 * only ever see database-shaped values.
 */
function promotionData(input: Record<string, unknown>): Prisma.PromotionUncheckedCreateInput {
  const amountOf = (value: unknown): number | undefined =>
    typeof value === 'object' && value !== null ? (value as { amount: number }).amount : undefined;

  return {
    ...input,
    ...(input.maxDiscount !== undefined ? { maxDiscount: amountOf(input.maxDiscount) } : {}),
    ...(input.minOrder !== undefined ? { minOrder: amountOf(input.minOrder) } : {}),
    ...(typeof input.startsAt === 'string' ? { startsAt: new Date(input.startsAt) } : {}),
    ...(typeof input.endsAt === 'string' ? { endsAt: new Date(input.endsAt) } : {}),
  } as Prisma.PromotionUncheckedCreateInput;
}
