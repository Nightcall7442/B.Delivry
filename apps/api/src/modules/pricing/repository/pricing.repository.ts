/**
 * Pricing persistence (Prisma). Tenant-scoped.
 */
import { money } from '@bazar/payments';
import type { Currency } from '@bazar/constants';
import type { Prisma, Tariff as TariffRow } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { SurgeRule, Tariff } from '../types/index.js';

function toTariff(row: TariffRow): Tariff {
  const currency = row.currency as Currency;
  return {
    id: row.id,
    name: row.name,
    cityId: row.cityId,
    base: money(row.base, currency),
    perKm: money(row.perKm, currency),
    freeDistanceMeters: row.freeDistanceMeters,
    minFee: money(row.minFee, currency),
    maxFee: row.maxFee === null ? null : money(row.maxFee, currency),
    commissionPercent: row.commissionPercent,
    serviceFee: money(row.serviceFee, currency),
    freeDeliveryThreshold:
      row.freeDeliveryThreshold === null ? null : money(row.freeDeliveryThreshold, currency),
    minOrder: money(row.minOrder, currency),
  };
}

export class PricingRepository extends BaseRepository {
  async findTariff(id: string): Promise<Tariff | null> {
    const row = await this.prisma.tariff.findFirst({ where: { id, active: true } });
    return row === null ? null : toTariff(row);
  }

  /**
   * Fallback when no zone matched but the city is known: a city-wide tariff,
   * or the global one. Without this an order in a not-yet-mapped district
   * would be unpriceable rather than merely expensive.
   */
  async findDefaultTariff(cityId?: string): Promise<Tariff | null> {
    const row = await this.prisma.tariff.findFirst({
      where: { active: true, OR: [{ cityId: cityId ?? null }, { cityId: null }] },
      // A city-specific tariff sorts before the global one.
      orderBy: [{ cityId: 'desc' }, { createdAt: 'asc' }],
    });
    return row === null ? null : toTariff(row);
  }

  async listSurgeRules(tariffId: string): Promise<SurgeRule[]> {
    const rows = await this.prisma.surgeRule.findMany({
      where: { tariffId, active: true },
    });
    return rows.map((row) => ({
      id: row.id,
      weekdays: row.weekdays,
      fromMinute: row.fromMinute,
      toMinute: row.toMinute,
      multiplier: row.multiplier,
    }));
  }

  async listTariffs(filters: {
    cityId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<TariffRow>> {
    const where: Prisma.TariffWhereInput = {
      ...(filters.cityId !== undefined ? { cityId: filters.cityId } : {}),
    };
    return this.page(
      filters,
      (page) => this.prisma.tariff.findMany({ where, orderBy: { createdAt: 'desc' }, ...page }),
      () => this.prisma.tariff.count({ where }),
    );
  }

  async createTariff(data: Prisma.TariffCreateInput): Promise<TariffRow> {
    return this.prisma.tariff.create({ data });
  }

  async updateTariff(id: string, data: Prisma.TariffUpdateInput): Promise<TariffRow> {
    return this.prisma.tariff.update({ where: { id }, data });
  }

  async createSurgeRule(data: Prisma.SurgeRuleUncheckedCreateInput) {
    return this.prisma.surgeRule.create({ data });
  }

  async deleteSurgeRule(id: string): Promise<void> {
    await this.prisma.surgeRule.update({ where: { id }, data: { active: false } });
  }
}

export { toTariff };
