/**
 * pricing types / DTOs.
 */
import type { Entity, Id, MoneyDto } from './common.js';

/**
 * A tariff is base + per-km, floored at a minimum, with optional surge.
 * Zones point at a tariff, so pricing is data, not code.
 */
export interface TariffDto extends Entity {
  name: string;
  cityId: Id | null;
  base: MoneyDto;
  perKm: MoneyDto;
  /** Distance included in `base` before per-km kicks in. */
  freeDistanceMeters: number;
  minFee: MoneyDto;
  maxFee: MoneyDto | null;
  /** Percent taken from the store subtotal as platform commission. */
  commissionPercent: number;
  /** Flat fee charged to the customer per order. */
  serviceFee: MoneyDto;
  /** Free delivery above this subtotal; null disables it. */
  freeDeliveryThreshold: MoneyDto | null;
  minOrder: MoneyDto;
  active: boolean;
}

export interface SurgeRuleDto extends Entity {
  tariffId: Id;
  /** 0 = Sunday. Empty means every day. */
  weekdays: number[];
  /** Minutes since local midnight. */
  fromMinute: number;
  toMinute: number;
  /** 1.5 = +50%. Applied to the delivery fee only, never to the goods. */
  multiplier: number;
  active: boolean;
}

export interface QuoteRequestDto {
  storeId: Id;
  addressId?: Id;
  lat?: number;
  lng?: number;
  subtotal?: MoneyDto;
  couponCode?: string;
  weightGrams?: number;
}

/** What the checkout screen shows before the order exists. */
export interface QuoteDto {
  deliverable: boolean;
  distanceMeters: number;
  etaSeconds: number;
  deliveryFee: MoneyDto;
  serviceFee: MoneyDto;
  discount: MoneyDto;
  subtotal: MoneyDto;
  total: MoneyDto;
  surgeMultiplier: number;
  minOrder: MoneyDto;
  /** Why it cannot be delivered: outside zones, below minimum, store closed. */
  reason: string | null;
}

export interface CreateTariffDto {
  name: string;
  cityId?: Id;
  base: MoneyDto;
  perKm: MoneyDto;
  freeDistanceMeters?: number;
  minFee: MoneyDto;
  maxFee?: MoneyDto;
  commissionPercent?: number;
  serviceFee?: MoneyDto;
  freeDeliveryThreshold?: MoneyDto;
  minOrder?: MoneyDto;
}

export type UpdateTariffDto = Partial<CreateTariffDto> & { active?: boolean };
