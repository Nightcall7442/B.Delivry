/**
 * Analytics HTTP controller — thin: validate → call service → map response.
 */
import type { Currency } from '@bazar/constants';
import type { MoneyDto, SalesReportDto } from '@bazar/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, query } from '../../../middleware/validation.middleware.js';
import type { AnalyticsService } from '../service/analytics.service.js';
import type { AnalyticsQuery } from '../types/index.js';
import type { AnalyticsQueryInput } from '../schemas/index.js';

/** Dates arrive as ISO strings and are only useful here as Date objects. */
function toQuery(input: AnalyticsQueryInput): AnalyticsQuery {
  return {
    ...(input.from !== undefined ? { from: new Date(input.from) } : {}),
    ...(input.to !== undefined ? { to: new Date(input.to) } : {}),
    ...(input.cityId !== undefined ? { cityId: input.cityId } : {}),
    ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
    ...(input.granularity !== undefined ? { granularity: input.granularity } : {}),
  };
}

export class AnalyticsController extends BaseController {
  constructor(private readonly service: AnalyticsService) {
    super();
  }

  demand = async (request: FastifyRequest, reply: FastifyReply) => {
    const { days, storeId } = query<{ days?: number; storeId?: string }>(request);
    return this.ok(reply, await this.service.demand({ days: days ?? 30, storeId }));
  };

  recordDemand = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.recordDemand(
      body<{ query: string; results: number; source: 'search' | 'list'; storeId?: string }>(
        request,
      ),
    );
    this.noContent(reply);
  };

  dashboard = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cityId } = query<{ cityId?: string }>(request);
    return this.ok(reply, await this.service.dashboard(cityId));
  };

  sales = async (request: FastifyRequest, reply: FastifyReply) => {
    const report = await this.service.sales(toQuery(query<AnalyticsQueryInput>(request)));
    const sum = (amount: number): MoneyDto => ({ amount, currency: report.currency as Currency });
    return this.ok(reply, {
      range: { from: report.from.toISOString(), to: report.to.toISOString() },
      orders: report.orders,
      revenue: sum(report.revenue),
      commission: sum(report.commission),
      deliveryFees: sum(report.deliveryFees),
      discounts: sum(report.discounts),
      byStatus: report.byStatus as SalesReportDto['byStatus'],
      series: report.series,
    } satisfies SalesReportDto);
  };

  topStores = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = query<AnalyticsQueryInput>(request);
    return this.ok(reply, await this.service.topStores(toQuery(input), input.limit));
  };

  couriers = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = query<AnalyticsQueryInput>(request);
    return this.ok(reply, await this.service.courierPerformance(toQuery(input), input.limit));
  };
}
