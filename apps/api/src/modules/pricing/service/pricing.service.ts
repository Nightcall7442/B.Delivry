/**
 * Pricing business logic. Delivery fee calculation, tariffs, zones, surge, commissions.
 */
import { PERMISSION, VEHICLE_AVG_SPEED_KMH, type Currency } from '@bazar/constants';
import { haversineMeters, type LatLng, type MapProvider } from '@bazar/maps';
import { money, zero, type Money } from '@bazar/payments';
import type { Prisma, Tariff as TariffRow } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { NotFoundError, UndeliverableAddressError } from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { GeoService } from '../../geo/service/geo.service.js';
import { TariffFeeCalculator, courierPayout } from '../domain/fee-calculator.js';
import type { PricingRepository } from '../repository/pricing.repository.js';
import type { Quote, Tariff } from '../types/index.js';

export interface QuoteRequest {
  from: LatLng;
  to: LatLng;
  subtotal: Money;
  cityId?: string;
  at?: Date;
  discount?: Money;
  freeDelivery?: boolean;
  thresholdSubtotal?: Money | undefined;
  weightGrams?: number | undefined;
  /** A shop's own limits win over the zone tariff's. */
  minOrder?: Money | undefined;
  freeDeliveryThreshold?: Money | null | undefined;
}

export interface PricingServiceDeps extends ServiceDeps {
  repository: PricingRepository;
  geo: GeoService;
  maps: MapProvider;
}

export class PricingService extends BaseService {
  private readonly repository: PricingRepository;
  private readonly geo: GeoService;
  private readonly maps: MapProvider;
  private readonly calculator = new TariffFeeCalculator();

  constructor(deps: PricingServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.geo = deps.geo;
    this.maps = deps.maps;
  }

  /**
   * The number the checkout screen shows and the order is created with.
   *
   * Zone decides the tariff, the map provider decides the distance, and the
   * calculator turns both into money. When the map vendor is unreachable the
   * distance falls back to straight-line: a slightly wrong fee beats refusing
   * to take the order.
   */
  async quote(request: QuoteRequest): Promise<Quote> {
    const resolution = await this.geo.resolveZone(request.to, request.cityId);
    if (!resolution.deliverable) {
      throw new UndeliverableAddressError(resolution.reason ?? 'Address is not deliverable');
    }

    const zoneTariff = await this.tariffFor(
      resolution.zone?.tariffId,
      resolution.cityId ?? undefined,
    );
    const tariff = {
      ...zoneTariff,
      ...(request.minOrder !== undefined ? { minOrder: request.minOrder } : {}),
      ...(request.freeDeliveryThreshold !== undefined
        ? { freeDeliveryThreshold: request.freeDeliveryThreshold }
        : {}),
    };
    const surgeRules = await this.repository.listSurgeRules(tariff.id);
    const distanceMeters = await this.distanceBetween(request.from, request.to);

    return this.calculator.quote({
      tariff,
      distanceMeters,
      subtotal: request.subtotal,
      ...(request.at !== undefined ? { at: request.at } : {}),
      surgeRules,
      ...(request.discount !== undefined ? { discount: request.discount } : {}),
      ...(request.freeDelivery !== undefined ? { freeDelivery: request.freeDelivery } : {}),
      ...(request.thresholdSubtotal !== undefined
        ? { thresholdSubtotal: request.thresholdSubtotal }
        : {}),
      ...(request.weightGrams !== undefined ? { weightGrams: request.weightGrams } : {}),
    });
  }

  /** Straight-line distance is the floor; a routed distance is always longer. */
  private async distanceBetween(from: LatLng, to: LatLng): Promise<number> {
    try {
      const distance = await this.maps.distance(from, to);
      return distance.meters;
    } catch (error) {
      this.logger.warn({ err: error }, 'map provider failed, falling back to haversine');
      return Math.round(haversineMeters(from, to));
    }
  }

  private async tariffFor(tariffId?: string, cityId?: string): Promise<Tariff> {
    const byZone = tariffId === undefined ? null : await this.repository.findTariff(tariffId);
    const tariff = byZone ?? (await this.repository.findDefaultTariff(cityId));
    if (tariff === null) {
      throw new NotFoundError('Tariff', tariffId ?? cityId);
    }
    return tariff;
  }

  /**
   * Rough ETA when no routing provider answered: distance over an average city
   * speed for the vehicle, plus the time the store needs to gather the goods.
   */
  estimateSeconds(
    distanceMeters: number,
    vehicle: keyof typeof VEHICLE_AVG_SPEED_KMH,
    preparationMinutes = 0,
  ): number {
    const speedKmh = VEHICLE_AVG_SPEED_KMH[vehicle];
    const travelSeconds = (distanceMeters / 1000 / speedKmh) * 3600;
    return Math.round(travelSeconds + preparationMinutes * 60);
  }

  payoutFor(deliveryFee: Money): Money {
    return courierPayout(deliveryFee);
  }

  zeroMoney(currency: Currency): Money {
    return zero(currency);
  }

  // ------------------------------------------------------------------ admin

  async listTariffs(filters: {
    cityId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<TariffRow>> {
    this.authorize(PERMISSION.PRICING_WRITE);
    return this.repository.listTariffs(filters);
  }

  async createTariff(data: Prisma.TariffCreateInput): Promise<TariffRow> {
    this.authorize(PERMISSION.PRICING_WRITE);
    return this.repository.createTariff(data);
  }

  async updateTariff(id: string, data: Prisma.TariffUpdateInput): Promise<TariffRow> {
    this.authorize(PERMISSION.PRICING_WRITE);
    return this.repository.updateTariff(id, data);
  }

  async createSurgeRule(data: Prisma.SurgeRuleUncheckedCreateInput) {
    this.authorize(PERMISSION.PRICING_WRITE);
    return this.repository.createSurgeRule(data);
  }

  async deleteSurgeRule(id: string): Promise<void> {
    this.authorize(PERMISSION.PRICING_WRITE);
    await this.repository.deleteSurgeRule(id);
  }

  async getTariff(id: string): Promise<Tariff> {
    const tariff = await this.repository.findTariff(id);
    if (tariff === null) throw new NotFoundError('Tariff', id);
    return tariff;
  }

  /** Money helper so callers do not import @bazar/payments just for this. */
  money(amount: number, currency: Currency): Money {
    return money(amount, currency);
  }
}
