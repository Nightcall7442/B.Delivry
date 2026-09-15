/**
 * Pricing HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { PricingService } from '../service/pricing.service.js';
import type { CreateTariffInput } from '../schemas/index.js';

export class PricingController extends BaseController {
  constructor(private readonly service: PricingService) {
    super();
  }

  listTariffs = async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = query<{ cityId?: string; page?: number; pageSize?: number }>(request);
    return this.paginated(reply, await this.service.listTariffs(filters));
  };

  getTariff = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.getTariff(id));
  };

  createTariff = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<CreateTariffInput>(request);
    // Money arrives as { amount, currency }; the table stores integers plus one
    // currency column, so it is flattened here rather than in the service.
    const data: Prisma.TariffCreateInput = {
      name: input.name,
      ...(input.cityId !== undefined ? { city: { connect: { id: input.cityId } } } : {}),
      base: input.base.amount,
      perKm: input.perKm.amount,
      freeDistanceMeters: input.freeDistanceMeters,
      minFee: input.minFee.amount,
      maxFee: input.maxFee?.amount ?? null,
      commissionPercent: input.commissionPercent,
      serviceFee: input.serviceFee?.amount ?? 0,
      freeDeliveryThreshold: input.freeDeliveryThreshold?.amount ?? null,
      minOrder: input.minOrder?.amount ?? 0,
      currency: input.base.currency,
    };
    return this.created(reply, await this.service.createTariff(data));
  };

  updateTariff = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<Partial<CreateTariffInput> & { active?: boolean }>(request);
    const data: Prisma.TariffUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.base !== undefined ? { base: input.base.amount } : {}),
      ...(input.perKm !== undefined ? { perKm: input.perKm.amount } : {}),
      ...(input.freeDistanceMeters !== undefined
        ? { freeDistanceMeters: input.freeDistanceMeters }
        : {}),
      ...(input.minFee !== undefined ? { minFee: input.minFee.amount } : {}),
      ...(input.maxFee !== undefined ? { maxFee: input.maxFee.amount } : {}),
      ...(input.commissionPercent !== undefined
        ? { commissionPercent: input.commissionPercent }
        : {}),
      ...(input.serviceFee !== undefined ? { serviceFee: input.serviceFee.amount } : {}),
      ...(input.freeDeliveryThreshold !== undefined
        ? { freeDeliveryThreshold: input.freeDeliveryThreshold.amount }
        : {}),
      ...(input.minOrder !== undefined ? { minOrder: input.minOrder.amount } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };
    return this.ok(reply, await this.service.updateTariff(id, data));
  };

  createSurgeRule = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<Prisma.SurgeRuleUncheckedCreateInput>(request);
    return this.created(reply, await this.service.createSurgeRule(input));
  };

  deleteSurgeRule = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.deleteSurgeRule(id);
    this.noContent(reply);
  };
}
